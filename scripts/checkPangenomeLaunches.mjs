#!/usr/bin/env node
/* global window, document -- page.evaluate() bodies run in the browser, not here */
//
// checkPangenomeLaunches.mjs
//
// Boots the /pangenomes launch URLs in a real hosted JBrowse build and
// reads back what the session ACTUALLY built — which display each track got,
// which views exist, whether the app error-paged.
//
// Why this is not covered by the unit tests: `pangenomeLinks.test.ts` asserts
// the spec we EMIT, and every one of those assertions passed while two launches
// were broken in the browser. A session spec is a request, and a host is free to
// ignore or reject parts of it:
//
//   - `latest` has no LinearMultiSampleVariantDisplay. Naming it in a track's
//     `displays[]` fails the config's MST union and takes down the WHOLE spec
//     session — the launch lands on "Select a view to launch". Naming it the
//     other way, as an inline display prop on the view's `tracks` entry, is
//     silently ignored instead and the callset opens as a single squashed row.
//     Neither shows up in a URL-shape test.
//   - The graph plugin boots on `main` and error-pages on `latest`
//     (`TypeError: (0,N.createSvgIcon) is not a function`). Its `latest/`
//     bundle is published from another repo, so a launch can break with nothing
//     pushed here — the same reason check-plugin-urls and the config canary
//     exist.
//
// Deliberately NOT in lint.yml or run.sh's gate_configs: it needs a browser, and
// its subject is a plugin published elsewhere plus an unreleased host, so a
// failure here should not block an unrelated deploy. Run it by hand when
// touching website/src/components/pangenome*, when bumping the graph plugin, and
// with `--host latest` before pointing `JBROWSE_BASE` (config/jbrowse.ts) at a
// release, since every launch below targets `main` until then.
//
// Usage:
//   node scripts/checkPangenomeLaunches.mjs                 # staging (main)
//   node scripts/checkPangenomeLaunches.mjs --host latest   # what production would get
//   node scripts/checkPangenomeLaunches.mjs --loci mhc-hla,lpa
//   node scripts/checkPangenomeLaunches.mjs --local   # working-tree configs
//
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { launch } from 'puppeteer-core'

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
  ].filter(Boolean)
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
    host: { type: 'string', default: 'main' },
    loci: { type: 'string' },
    timeout: { type: 'string', default: '120000' },
    local: { type: 'boolean', default: false },
  },
})

const HOST = `https://jbrowse.org/code/jb2/${values.host}`
const TIMEOUT = Number(values.timeout)

// The site's own builders, so this checks the real thing rather than a copy.
const { HPRC_DATASET, HPRC_GRAPH_BROWSER } =
  await import('../website/src/components/pangenomeDataset.ts')
const { regionAnswer } =
  await import('../website/src/components/pangenomeAnswer.ts')
const { pangenomeExamples } =
  await import('../website/src/components/pangenomeExamples.ts')
const { graphRegionUrl } =
  await import('../website/src/components/pangenomeLinks.ts')
const { annotatedHaplotypes } =
  await import('../website/src/components/pangenomePanels.ts')

// The haplotypes the working-tree config gives gene models. Against the served
// config (no --local) a lane in this set that draws bare is a config that has
// not been published yet, which is worth failing on.
const annotated = annotatedHaplotypes(
  JSON.parse(
    fs.readFileSync(
      new URL('../website/pangenome-config/hprc-grch38.json', import.meta.url),
      'utf8',
    ),
  ),
  HPRC_GRAPH_BROWSER.haplotypeLanesTrackId,
)

// Panels that name a haplotype the graph places no walk for in the window. The
// sidecar cannot tell those from a deletion, so the panel keeps them until the
// build box publishes per-haplotype placement (agent-docs/reference/PANGENOME_PORTAL.md).
const KNOWN_UNPLACED = { defb: ['HG00097#1'], nphp1: ['HG00544#1'] }

const graphDisplay = {
  trackId: HPRC_GRAPH_BROWSER.segmentsTrackId,
  type: 'LinearGraphDisplay',
}

const retarget = url =>
  url.replace(/\/code\/jb2\/[^/]+/, `/code/jb2/${values.host}`)

// What the page answers when a reader clicks each example. BandageJS is not a
// JBrowse host, so its link is the one launch not booted.
const wanted = values.loci?.split(',')
const examples = pangenomeExamples(HPRC_DATASET)
const launches = []
for (const example of examples.filter(e => !wanted || wanted.includes(e.id))) {
  const answer = await regionAnswer(HPRC_DATASET, examples, example.region)
  const lanes = answer.reading?.panel?.lanes.map(l => l.haplotype) ?? []
  for (const { kind, url } of answer.launches) {
    const name = `${example.id}: ${kind}`
    if (kind === 'variants') {
      // A single-row display means the declaration was ignored, silently.
      launches.push({
        name,
        url: retarget(url),
        expectDisplays: [
          {
            trackId: HPRC_DATASET.graphVcf.trackId,
            type: 'LinearMultiSampleVariantDisplay',
          },
        ],
      })
    } else if (kind === 'graph') {
      launches.push({
        name,
        url: retarget(url),
        expectDisplays: [graphDisplay],
        expectTier: 'fine',
      })
    } else if (kind === 'haplotypes') {
      // The display type alone passed while every lane errored on a clip that
      // lost its coordinates, so this reads the lanes back: one row per panel
      // haplotype, and no error.
      launches.push({
        name,
        url: retarget(url),
        expectLanes: lanes,
        knownUnplaced: KNOWN_UNPLACED[example.id] ?? [],
      })
    }
  }
}

// One whole-chromosome launch. chr21 is the shortest autosome, so it is the
// cheapest proof that the graph track cuts its coarse tier at that zoom; --loci
// filtering does not apply to it.
const chr21 = HPRC_GRAPH_BROWSER.chromosomes.find(c => c.name === 'chr21')
if (chr21 && !wanted) {
  launches.push({
    name: 'chr21: whole-chromosome tier graph',
    url: retarget(
      graphRegionUrl(HPRC_DATASET, {
        chrom: 'chr21',
        start: 0,
        end: chr21.length,
      }),
    ),
    expectDisplays: [graphDisplay],
    expectTier: 'coarse',
  })
}

// --local answers the graph config's own url with the working-tree file, the way
// `checkConfigCompat.mjs --local` does, so a config change is browser-tested
// before it is public. Without it these launches read the SERVED config and a
// changed trackId or data url in the tree is invisible to them -- which is the
// state the v2.0 -> v2.1 bump was in: every launch booted, against the old
// config. Only the config document is substituted; the data is the real data.
const localConfigs = new Map()
if (values.local) {
  const dir = new URL('../website/pangenome-config/', import.meta.url)
  // `<basename>.json` publishes to `/pangenome/<basename>/config.json` -- the
  // rule in upload.sh's own loop. The dotfiles beside them are the upload
  // stamps, which are byte-exact copies of what the bucket already serves and
  // therefore exactly what --local must not substitute.
  const configs = fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.startsWith('.'))
  for (const name of configs) {
    const base = name.replace(/\.json$/, '')
    localConfigs.set(
      `https://jbrowse.org/pangenome/${base}/config.json`,
      fs.readFileSync(new URL(name, dir), 'utf8'),
    )
    // And the config's SIDECARS, from `<basename>/` beside it. Without these
    // --local is a trap rather than a gate: a config naming a chrom.sizes that
    // is not published yet builds its display perfectly and reads `ok`, while
    // every assembly it declares fails `loadPre()` on a 404 and its lanes draw
    // nothing. Which is the state this check was in the first time the GBZ lane
    // passed it.
    const sidecars = new URL(`${base}/`, dir)
    if (fs.existsSync(sidecars)) {
      for (const f of fs
        .readdirSync(sidecars)
        .filter(f => !f.startsWith('.'))) {
        localConfigs.set(
          `https://jbrowse.org/pangenome/${base}/${f}`,
          fs.readFileSync(new URL(f, sidecars), 'utf8'),
        )
      }
    }
  }
  if (localConfigs.size === 0) {
    throw new Error('--local found no configs in website/pangenome-config/')
  }
  console.log(
    `--local: serving ${localConfigs.size} working-tree file(s) to the app`,
  )
}

const browser = await launch({
  executablePath: findChrome(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

// Pauses only the urls --local substitutes, on the page's own CDP session.
// puppeteer's setRequestInterception, which this used to be, pauses every
// request the RPC worker makes too and never releases them, so under --local
// no track data loaded at all; a check that reads only display types could
// not tell.
async function serveLocalConfigs(page) {
  const cdp = await page.createCDPSession()
  cdp.on('Fetch.requestPaused', ({ requestId, request }) => {
    const body = localConfigs.get(request.url)
    void (
      body === undefined
        ? cdp.send('Fetch.continueRequest', { requestId })
        : cdp.send('Fetch.fulfillRequest', {
            requestId,
            responseCode: 200,
            responseHeaders: [
              { name: 'content-type', value: 'application/json' },
              { name: 'access-control-allow-origin', value: '*' },
            ],
            body: Buffer.from(body).toString('base64'),
          })
    ).catch(() => {})
  })
  await cdp.send('Fetch.enable', {
    patterns: [...localConfigs.keys()].map(urlPattern => ({ urlPattern })),
  })
}

// The lanes are read from a remote database after the view builds, which takes
// longer than the fixed settle below, so this polls until they land or fail --
// and, for a lane whose haplotype has a gene track, until its genes are fetched
// too, since a lane that aligns and reads "no annotation" is the silent half.
// A lane the graph places nowhere in the window has no genes to fetch either,
// and is reported as the data it is rather than as an unfetched gene track.
async function readLanes(page, expected) {
  const deadline = Date.now() + TIMEOUT
  const withGenes = expected.filter(h => annotated.has(h))
  let lanes
  while (Date.now() < deadline) {
    lanes = await page.evaluate(
      (want, withGenes) => {
        const display = window.JBrowseRootModel?.session?.views
          ?.flatMap(v => v.tracks ?? [])
          .map(t => t.displays?.[0])
          .find(d => d?.type === 'MultiWaySyntenyDisplay')
        if (!display) {
          return undefined
        }
        const rows = new Map(
          display.rowAssemblies.map(r => [display.laneKey(r), r]),
        )
        const rowOf = h => rows.get(display.laneKey(h))
        const records = new Set(
          (display.features ?? []).map(f =>
            display.laneKey(f.get('mate')?.assemblyName ?? ''),
          ),
        )
        const placed = h => display.rowFrames.get(rowOf(h)) !== undefined
        const drawn = withGenes.filter(h => rowOf(h) && placed(h))
        return {
          error: display.error ? `${display.error}` : undefined,
          missing: want.filter(h => !rowOf(h)),
          noWalk: want.filter(
            h => !rowOf(h) && !records.has(display.laneKey(h)),
          ),
          offWindow: want.filter(h => rowOf(h) && !placed(h)),
          bare: drawn.filter(h => !display.laneGeneAdapters.has(rowOf(h))),
          genes: Object.fromEntries(
            drawn.flatMap(h => {
              const held = display.laneGenes?.held?.get(rowOf(h))
              return held ? [[h, held.genes.length]] : []
            }),
          ),
        }
      },
      expected,
      withGenes,
    )
    const settled =
      lanes &&
      lanes.missing.length === 0 &&
      withGenes.every(
        h => lanes.bare.includes(h) || lanes.genes[h] !== undefined,
      )
    if (lanes?.error || settled) {
      return lanes
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  return lanes
}

// A graph display that built is not a graph that drew, so this polls the pane
// until its cut lands or fails.
async function readGraph(page, trackId) {
  const deadline = Date.now() + TIMEOUT
  let graph
  while (Date.now() < deadline) {
    graph = await page.evaluate(trackId => {
      const display = window.JBrowseRootModel?.session?.views
        ?.flatMap(v => v.tracks ?? [])
        .find(t => t.configuration?.trackId === trackId)?.displays?.[0]
      const pane = display?.type === 'LinearGraphDisplay' ? display : undefined
      return (
        pane && {
          error: pane.error ? `${pane.error}` : undefined,
          nodes: pane.hasGraph ? pane.nodeCount : undefined,
          tier: pane.cutTier,
          layout: pane.chosenLayoutMode,
          tooLarge: pane.regionTooLarge ? pane.regionTooLargeReason : undefined,
        }
      )
    }, trackId)
    if (graph?.error || graph?.nodes !== undefined) {
      return graph
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  return graph
}

let failures = 0
for (const {
  name,
  url,
  expectDisplays,
  expectTier,
  expectLanes,
  knownUnplaced = [],
} of launches) {
  const page = await browser.newPage()
  const problems = []
  const notes = []
  try {
    if (localConfigs.size > 0) {
      await serveLocalConfigs(page)
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
    // Wait for EITHER a session or the error page. Waiting on the session alone
    // means an app that error-paged — the exact failure this script exists to
    // catch — is reported as a timeout at the full TIMEOUT, with the real cause
    // (which is on screen the whole time) never read.
    await page.waitForFunction(
      () =>
        window.JBrowseRootModel?.session !== undefined ||
        /JBrowse Error|No matching type for union/.test(
          document.body.innerText,
        ),
      { timeout: TIMEOUT },
    )
    // The spec session expands after the model exists; give the views time to
    // build before reading them back.
    await new Promise(r => setTimeout(r, 12_000))

    const state = await page.evaluate(() => ({
      errorText: /JBrowse Error|No matching type for union/.test(
        document.body.innerText,
      )
        ? document.body.innerText.slice(0, 300)
        : undefined,
      views: (window.JBrowseRootModel?.session?.views ?? []).map(v => ({
        type: v.type,
        tracks: (v.tracks ?? []).map(t => ({
          trackId: t.configuration?.trackId,
          display: t.displays?.[0]?.type,
        })),
      })),
    }))

    if (state.errorText) {
      problems.push(`app error page: ${state.errorText.replace(/\s+/g, ' ')}`)
    }
    if (state.views.length === 0) {
      problems.push('the spec session built no views')
    }
    if (expectTier) {
      const graph = await readGraph(page, graphDisplay.trackId)
      if (!graph) {
        problems.push(`no LinearGraphDisplay on ${graphDisplay.trackId}`)
      } else if (graph.error) {
        problems.push(`graph: ${graph.error.split('\n')[0]}`)
      } else if (!graph.nodes) {
        problems.push(
          `the graph never drew${graph.tooLarge ? `: ${graph.tooLarge}` : ''}`,
        )
      } else {
        if (graph.tier !== expectTier) {
          problems.push(
            `the graph cut its ${graph.tier} tier, wanted ${expectTier}`,
          )
        }
        notes.push(
          `graph: ${graph.nodes} nodes, ${graph.tier} tier, ${graph.layout} layout`,
        )
      }
    }
    if (expectLanes) {
      const lanes = await readLanes(page, expectLanes)
      if (!lanes) {
        problems.push('no MultiWaySyntenyDisplay in the session')
      } else if (lanes.error) {
        problems.push(`lanes: ${lanes.error.split('\n')[0]}`)
      } else {
        const unplaced = h => !knownUnplaced.includes(h)
        const neverDrew = lanes.missing.filter(h => !lanes.noWalk.includes(h))
        if (neverDrew.length) {
          problems.push(
            `${neverDrew.length} of ${expectLanes.length} lanes never drew: ${neverDrew.join(', ')}`,
          )
        }
        const noWalk = lanes.noWalk.filter(unplaced)
        if (noWalk.length) {
          problems.push(
            `the graph returned no walk near the window for ${noWalk.join(', ')}`,
          )
        }
        const offWindow = lanes.offWindow.filter(unplaced)
        if (offWindow.length) {
          problems.push(
            `the graph places ${offWindow.join(', ')} only outside the window, so the lane is empty`,
          )
        }
        const known = [...lanes.noWalk, ...lanes.offWindow].filter(
          h => !unplaced(h),
        )
        if (known.length) {
          notes.push(`known unplaced: ${known.join(', ')}`)
        }
      }
      if (lanes?.bare.length) {
        problems.push(
          `${lanes.bare.length} lanes with a gene track read "no annotation": ${lanes.bare.join(', ')}`,
        )
      }
      const unfetched = expectLanes.filter(
        h =>
          annotated.has(h) &&
          !lanes?.missing.includes(h) &&
          !lanes?.offWindow.includes(h) &&
          !lanes?.bare.includes(h) &&
          lanes?.genes[h] === undefined,
      )
      if (unfetched.length) {
        problems.push(`genes never fetched on ${unfetched.join(', ')}`)
      }
      if (lanes) {
        notes.push(
          `genes on ${Object.keys(lanes.genes).length} of ${expectLanes.length} lanes: ${Object.entries(
            lanes.genes,
          )
            .map(([h, n]) => `${h} ${n}`)
            .join(', ')}`,
        )
      }
    }
    for (const expected of expectDisplays ?? []) {
      const track = state.views
        .flatMap(v => v.tracks)
        .find(t => t.trackId === expected.trackId)
      if (!track) {
        problems.push(`track ${expected.trackId} never opened`)
      } else if (track.display !== expected.type) {
        problems.push(
          `${expected.trackId} opened as ${track.display}, wanted ${expected.type}`,
        )
      }
    }
  } catch (e) {
    problems.push(`${e}`.split('\n')[0])
  }
  await page.close()

  if (problems.length) {
    failures++
    console.log(`FAIL ${name}`)
    for (const p of problems) {
      console.log(`       ${p}`)
    }
  } else {
    console.log(`ok   ${name}`)
  }
  for (const n of notes) {
    console.log(`       ${n}`)
  }
}

await browser.close()
console.log(
  failures
    ? `\n${failures}/${launches.length} launches failed on ${HOST}`
    : `\nall ${launches.length} launches boot on ${HOST}`,
)
process.exit(failures ? 1 : 0)
