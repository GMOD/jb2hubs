#!/usr/bin/env node
/* global window -- page.evaluate() bodies run in the browser, not here */
//
// checkGeneOrderLaunches.ts
//
// Builds the conserved-gene-order page's "Open <gene> in JBrowse across N
// genomes" launch exactly as the page does, boots it in a hosted JBrowse build,
// and reads back where each lane of the multi-way synteny display landed.
//
// The unit tests assert the session we emit; this asserts what JBrowse made of
// it. A lane is placed by its liftOver chain, or by NCBI's ortholog pairs in a
// `data:` PAF, and either can land somewhere other than the gene with no error:
// hg38's chain put chicken's TP53 lane on chr9 (2026-10-15).
//
// Deliberately NOT in lint.yml or run.sh's gate_configs: it needs a browser,
// the neighborhood Lambda and NCBI. Run it by hand when touching
// website/src/components/geneOrderStar.ts or the star's panel.
//
// Needs website/public/ortholog_index.json and synteny_stars.json, which
// `pnpm generate` writes.
//
// Usage:
//   pnpm check-gene-order-launches                 # HBB and TP53 on main
//   pnpm check-gene-order-launches --genes BRCA1 --host v5.0.0
//
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { launch } from 'puppeteer-core'

import { neighborhoodStar } from '../website/src/components/geneOrderStar.ts'
import { layoutNeighborhood } from '../website/src/components/multiSyntenyLayout.ts'
import { getNeighborhood } from '../website/src/components/neighborhoodClient.ts'
import { createStore } from '../website/src/components/orthologDb.ts'
import { resolveGeneId } from '../website/src/components/orthologSet.ts'

import type { AssemblyIndex } from '../website/src/components/orthologDb.ts'
import type { StarIndex } from '../website/src/lib/syntenyStars.ts'

// Same resolution as checkConfigCompat.mjs: puppeteer-core carries no Chromium.
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ...fs
      .globSync(
        path.join(os.homedir(), '.cache/puppeteer/chrome/*/chrome-*/chrome'),
      )
      .sort()
      .reverse(),
  ].filter((c): c is string => !!c)
  const found = candidates.find(c => fs.existsSync(c))
  if (!found) {
    throw new Error(
      `no browser found; set CHROME_PATH. Looked in: ${candidates.join(', ')}`,
    )
  }
  return found
}

const { values } = parseArgs({
  options: {
    genes: { type: 'string', default: 'HBB,TP53' },
    ref: { type: 'string', default: '9606' },
    host: { type: 'string', default: 'main' },
    timeout: { type: 'string', default: '90000' },
  },
})
const TIMEOUT = Number(values.timeout)
const refTaxonId = Number(values.ref)

// Where a lane has to land for the launch to count as right: the gene's own
// region in that genome.
const EXPECTED: Record<string, Record<string, [RegExp, number, number]>> = {
  HBB: {
    mm39: [/^chr7$/, 103_400_000, 103_600_000],
    panTro6: [/^chr11$/, 5_000_000, 5_300_000],
  },
  TP53: {
    mm39: [/^chr11$/, 69_200_000, 69_700_000],
    // chicken's GRCg7b, placed by NCBI's orthologs
    'GCF_016699485.2': [/^NW_024096016\.1$/, 0, 30_000],
  },
}

function readJson<T>(file: string): T {
  const url = new URL(`../website/public/${file}`, import.meta.url)
  if (!fs.existsSync(url)) {
    throw new Error(`${url.pathname} is missing; run pnpm generate in website/`)
  }
  return JSON.parse(fs.readFileSync(url, 'utf8')) as T
}

const store = createStore(readJson<AssemblyIndex>('ortholog_index.json'))
const stars = readJson<StarIndex>('synteny_stars.json')
const hosted = (accession: string) => store.find(accession)

// The parts of a MultiWaySyntenyDisplay this reads, by the names jbrowse-core
// main gives them
interface StarDisplay {
  type: string
  error?: unknown
  rowAssemblies: unknown[]
  laneKey: (row: unknown) => string
  rowFrames: Map<unknown, { refName: string; fitMin: number; fitMax: number }>
  laneGenes?: { held?: Map<unknown, { genes?: unknown[] }> }
}

interface RootModelState {
  session?: {
    views?: {
      tracks?: { configuration: { name: string }; displays?: StarDisplay[] }[]
    }[]
  }
}

interface Lane {
  track: string
  refName?: string
  start?: number
  end?: number
  genes?: number
}

const browser = await launch({
  executablePath: findChrome(),
  headless: true,
  args: ['--no-sandbox'],
})
const failures: string[] = []
try {
  for (const symbol of values.genes.split(',')) {
    const geneId = await resolveGeneId(symbol, refTaxonId)
    if (!geneId) {
      failures.push(`${symbol}: NCBI resolves no gene by that symbol`)
      continue
    }
    const nb = await getNeighborhood(geneId, refTaxonId)
    const rows = layoutNeighborhood(nb, { mode: 'ordinal', spanWidth: 0 }).rows
    const star = neighborhoodStar(nb, rows, nb.species, { hosted, stars })
    if (!star) {
      failures.push(`${symbol}: the page would offer no star launch`)
      continue
    }
    const url = star.url.replace(
      /\/code\/jb2\/[^/]+/,
      `/code/jb2/${values.host}`,
    )
    const page = await browser.newPage()
    await page.setViewport({ width: 1400, height: 1000 })
    const t0 = Date.now()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    let lanes: Record<string, Lane | string> = {}
    let errors: string[] = []
    while (Date.now() - t0 < TIMEOUT) {
      const read = await page.evaluate(() => {
        const out: Record<string, Lane | string> = {}
        const errs: string[] = []
        const root: RootModelState | undefined = Reflect.get(
          window,
          'JBrowseRootModel',
        )
        const session = root?.session
        for (const track of session?.views?.[0]?.tracks ?? []) {
          const d = track.displays?.[0]
          if (d?.type !== 'MultiWaySyntenyDisplay') {
            continue
          }
          if (d.error) {
            errs.push(String(d.error).slice(0, 300))
          }
          for (const row of d.rowAssemblies) {
            const frame = d.rowFrames.get(row)
            out[d.laneKey(row)] = frame
              ? {
                  track: track.configuration.name,
                  refName: frame.refName,
                  start: Math.round(frame.fitMin),
                  end: Math.round(frame.fitMax),
                  genes: d.laneGenes?.held?.get(row)?.genes?.length,
                }
              : 'no frame'
          }
        }
        return { lanes: out, errors: errs }
      })
      lanes = read.lanes
      errors = read.errors
      const placed = Object.values(lanes)
      if (
        errors.length > 0 ||
        (placed.length > 0 &&
          placed.every(l => typeof l === 'object' && l.genes !== undefined))
      ) {
        break
      }
      await new Promise(r => setTimeout(r, 1000))
    }
    const settled = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`\n${symbol}: ${Object.keys(lanes).length} lanes, ${settled} s`)
    for (const [name, lane] of Object.entries(lanes)) {
      console.log(
        typeof lane === 'string'
          ? `  ${name}: ${lane}`
          : `  ${name}: ${lane.refName}:${lane.start}-${lane.end}, ${lane.genes ?? '?'} genes (${lane.track})`,
      )
    }
    for (const e of errors) {
      failures.push(`${symbol}: display error ${e}`)
    }
    for (const [name, lane] of Object.entries(lanes)) {
      if (typeof lane === 'string') {
        failures.push(`${symbol} ${name}: ${lane}`)
      }
    }
    for (const [name, [refName, start, end]] of Object.entries(
      EXPECTED[symbol] ?? {},
    )) {
      const lane = lanes[name]
      if (
        typeof lane !== 'object' ||
        !refName.test(lane.refName ?? '') ||
        (lane.end ?? 0) < start ||
        (lane.start ?? 0) > end
      ) {
        failures.push(
          `${symbol} ${name}: expected ${refName.source}:${start}-${end}, got ${JSON.stringify(lane)}`,
        )
      }
    }
    await page.close()
  }
} finally {
  await browser.close()
}
if (failures.length > 0) {
  console.error(`\n${failures.length} failed:\n${failures.join('\n')}`)
  process.exit(1)
}
console.log('\nevery lane placed')
