#!/usr/bin/env node
//
// checkProteinLaunches.ts
//
// Resolves the protein browser's example genes exactly as the page does, boots
// each launch URL in a real hosted JBrowse build, and reads back what the
// ProteinView ACTUALLY did: whether the structure loaded, whether its residues
// were aligned onto the transcript, and whether the genome view opened its
// tracks.
//
// Why the unit tests cannot cover this: they assert the session we EMIT, and
// every one of them passed while two of the eight example chips were broken in
// the browser —
//
//   - DMD named an AlphaFold file that does not exist (dystrophin is past the
//     length cap; only isoform models are published), so the 3D view was an
//     error, and the card still said "opens the AlphaFold structure".
//   - PAX6 opened a 504-residue isoform paired with a 422-residue sequence
//     presented as that transcript's translation, so every residue past the
//     first divergent exon lit the wrong codon. Nothing errors when a mapping is
//     merely wrong.
//
// Both are properties of the launched session, not of the URL. A session that
// hydrates with a ProteinView whose `pairwiseAlignment` never arrives, or whose
// structure never becomes ready, is the failure this exists to catch.
//
// The host contract is the third thing it reads back. `latest` (v4.3.0) has no
// workspace `layout` field and persists a session's `useWorkspaces` into the
// reader's localStorage, so a launch must not carry either there
// (HOST_HAS_WORKSPACE_LAYOUT in website/src/config/jbrowse.ts). The page's
// modules run here with `features.staging` false, which is the production
// shape: the session carries no layout on any host, and the check is that the
// launch left the reader's `useWorkspaces` preference alone. The staging
// shape — the layout tree itself, on `main` — is pinned by
// proteinSession.test.ts and not exercised here.
//
// Deliberately NOT in lint.yml or run.sh's gate_configs: it needs a browser and
// live NCBI/EBI/AlphaFold answers. Run it by hand when touching
// website/src/components/{geneStructure,proteinSession,structureSources}.ts or
// the launch card, and before promoting `features.proteinBrowser`.
//
// Usage:
//   pnpm check-protein-launches                          # human examples, on main
//   pnpm check-protein-launches --genes TP53,DMD --ref 9606
//   pnpm check-protein-launches --host latest            # what production would get
//
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { launch } from 'puppeteer-core'

import { examplesFor } from '../website/src/components/geneExamples.ts'
import { fetchGeneStructure } from '../website/src/components/geneStructure.ts'
import { buildSessionUrl } from '../website/src/components/proteinSession.ts'
import {
  fetchExperimentalStructures,
  pickAlphaFoldModel,
} from '../website/src/components/structureSources.ts'

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
  ].filter(c => c !== undefined)
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
    genes: { type: 'string' },
    ref: { type: 'string', default: '9606' },
    timeout: { type: 'string', default: '150000' },
  },
})

const HOST = `https://jbrowse.org/code/jb2/${values.host}`
const TIMEOUT = Number(values.timeout)
const REF = Number(values.ref)
const PUBLIC = path.resolve(import.meta.dirname, '../website/public')

// The page's own resolvers run here unchanged, but two things differ outside a
// browser. Site-relative fetches (`/ortholog_index.json`, the assembly index
// genomeTarget.ts reads) have no origin to resolve against, so they are served
// from website/public. And alphafold.ebi.ac.uk answers node's default
// user-agent with 403, so every request carries a browser-like one.
const realFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  if (url.startsWith('/')) {
    const file = path.join(PUBLIC, url)
    return fs.existsSync(file)
      ? Promise.resolve(new Response(fs.readFileSync(file)))
      : Promise.resolve(new Response('', { status: 404 }))
  }
  const headers = new Headers(init?.headers)
  headers.set('user-agent', 'Mozilla/5.0 (X11; Linux x86_64) jb2hubs-check')
  return realFetch(input, { ...init, headers })
}

const genes = values.genes?.split(',') ?? examplesFor(REF).map(e => e.symbol)

// The builder targets whatever the production flag says, and a GFF gene track
// sends it to the gene-track host; retarget to the host under test either way.
function retarget(url: string) {
  return url.replace(/\/code\/jb2\/[^/]+/, `/code/jb2/${values.host}`)
}

type Launch =
  | { name: string; resolveError: string }
  | {
      name: string
      url: string
      expectStructure: boolean
      expectGeneTrack: boolean
      expectExact: boolean
      tiled: boolean
    }

const launches: Launch[] = []
for (const gene of genes) {
  try {
    const structure = await fetchGeneStructure(gene, REF)
    const model = pickAlphaFoldModel(
      structure.alphafold,
      structure.proteinSequence,
    )
    // The card's own default: the AlphaFold model, else the best-covering PDB
    // entry (BRCA2 is past AlphaFold's length cap and has 17 PDBe entries).
    const pdb = model
      ? undefined
      : structure.uniprotId
        ? (await fetchExperimentalStructures(structure.uniprotId))[0]
        : undefined
    const primary = model
      ? { url: model.url }
      : pdb
        ? { pdbId: pdb.pdbId }
        : undefined
    const { session, url } = buildSessionUrl({ structure, primary })
    const structureName = model
      ? model.entity
      : pdb
        ? `PDB ${pdb.pdbId}`
        : 'no structure'
    launches.push({
      name: `${gene} (${structure.transcript.name}, ${structureName})`,
      url: retarget(url),
      expectStructure: !!primary,
      expectGeneTrack: !!structure.target.geneTrackId,
      // the transcript's own translation is what the plugin aligns; an
      // AlphaFold model folded from exactly it should align as an identity
      expectExact: !!model && model.sequence === structure.proteinSequence,
      tiled: 'layout' in session,
    })
  } catch (e) {
    launches.push({ name: gene, resolveError: `${e}`.split('\n')[0] ?? '' })
  }
}

// What page.evaluate reads off the app. Only the fields read are named; the
// root model is reached through Reflect because the page, not this script,
// declares it.
interface StructureState {
  url?: string
  pairwiseAlignment?: unknown
  exactMatch?: boolean
  error?: unknown
}
interface ViewState {
  type: string
  tracks?: unknown[]
  error?: unknown
  structures?: StructureState[]
}
interface RootModelState {
  session?: { views?: ViewState[] }
}

const browser = await launch({
  executablePath: findChrome(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

let failures = 0
for (const launchSpec of launches) {
  const problems: string[] = []
  if ('resolveError' in launchSpec) {
    problems.push(`could not resolve: ${launchSpec.resolveError}`)
  } else {
    const page = await browser.newPage()
    try {
      await page.goto(launchSpec.url, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      })
      // Wait for the structure to be ready OR the error page. Waiting on ready
      // alone reports an error-paged app as a timeout with the cause unread.
      await page.waitForFunction(
        (expectStructure: boolean) => {
          const root: RootModelState | undefined = Reflect.get(
            window,
            'JBrowseRootModel',
          )
          return (
            document.querySelector('[data-testid="protein-view-ready"]') !==
              null ||
            (!expectStructure && (root?.session?.views ?? []).length > 0) ||
            /JBrowse Error|No matching type for union/.test(
              document.body.innerText,
            )
          )
        },
        { timeout: TIMEOUT },
        launchSpec.expectStructure,
      )
      // The pairwise alignment runs after the structure is ready; give it a
      // moment before reading the model back.
      await new Promise(r => setTimeout(r, 8000))

      const state = await page.evaluate(() => {
        const root: RootModelState | undefined = Reflect.get(
          window,
          'JBrowseRootModel',
        )
        const views = root?.session?.views ?? []
        const protein = views.find(v => v.type === 'ProteinView')
        return {
          errorText: /JBrowse Error|No matching type for union/.test(
            document.body.innerText,
          )
            ? document.body.innerText.slice(0, 300)
            : undefined,
          viewTypes: views.map(v => v.type),
          lgvTracks: (
            views.find(v => v.type === 'LinearGenomeView')?.tracks ?? []
          ).length,
          protein: protein
            ? {
                error: protein.error ? `${protein.error}` : undefined,
                structures: (protein.structures ?? []).map(s => ({
                  url: s.url,
                  aligned: !!s.pairwiseAlignment,
                  exactMatch: s.exactMatch,
                  error: s.error ? `${s.error}` : undefined,
                })),
              }
            : undefined,
          // v4.3.0 persists the session's `useWorkspaces` here; a launch that
          // flips it rewrites the reader's preference for every later session
          useWorkspacesPreference: localStorage.getItem('useWorkspaces'),
        }
      })

      if (state.errorText) {
        problems.push(`app error page: ${state.errorText.replace(/\s+/g, ' ')}`)
      }
      if (!state.viewTypes.includes('LinearGenomeView')) {
        problems.push('no LinearGenomeView in the session')
      }
      if (launchSpec.expectGeneTrack && state.lgvTracks === 0) {
        problems.push('the genome view opened no tracks')
      }
      if (launchSpec.expectStructure) {
        const s = state.protein?.structures[0]
        if (!state.protein) {
          problems.push('no ProteinView in the session')
        } else if (state.protein.error || s?.error) {
          problems.push(`ProteinView error: ${state.protein.error ?? s?.error}`)
        } else if (!s?.aligned) {
          problems.push(
            'the structure never aligned onto the transcript (no pairwiseAlignment)',
          )
        } else if (launchSpec.expectExact && !s.exactMatch) {
          problems.push(
            'model sequence equals the translation, but the plugin did not see an exact match',
          )
        }
      }
      if (!launchSpec.tiled && state.useWorkspacesPreference === 'true') {
        problems.push(
          'the launch wrote useWorkspaces=true into localStorage: the host persists the session flag as the reader’s preference',
        )
      }
    } catch (e) {
      problems.push(`${e}`.split('\n')[0] ?? '')
    }
    await page.close()
  }

  if (problems.length) {
    failures++
    console.log(`FAIL ${launchSpec.name}`)
    for (const p of problems) {
      console.log(`       ${p}`)
    }
  } else {
    console.log(`ok   ${launchSpec.name}`)
  }
}

await browser.close()
const tiledCount = launches.filter(l => 'tiled' in l && l.tiled).length
console.log(
  `\n${tiledCount}/${launches.length} sessions carried a workspace layout (0 is the production shape)`,
)
console.log(
  failures
    ? `${failures}/${launches.length} launches failed on ${HOST}`
    : `all ${launches.length} launches boot on ${HOST}`,
)
process.exit(failures ? 1 : 0)
