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
// Deliberately NOT in lint.yml or run.sh's gate_configs: it needs a browser and
// live NCBI/EBI/AlphaFold answers. Run it by hand when touching
// website/src/components/{geneStructure,proteinSession,proteinLaunch}.ts,
// the launch card, or the `p2s_mapper` version — the entry list and the
// isoform alignment a focus is carried across by both come from that package —
// and before promoting `features.proteinBrowser`.
//
// Usage:
//   pnpm check-protein-launches                          # human examples, on main
//   pnpm check-protein-launches --genes TP53,DMD --ref 9606
//   pnpm check-protein-launches --host v5.0.0            # a release, once one reads the hash
//
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { fetchExperimentalStructures } from 'p2s_mapper'
import { launch } from 'puppeteer-core'

import { editConsequence } from '../website/src/components/editConsequence.ts'
import { examplesFor } from '../website/src/components/geneExamples.ts'
import {
  canonicalSequence,
  fetchGeneStructure,
} from '../website/src/components/geneStructure.ts'
import { loadLaunchAlignment } from '../website/src/components/proteinAlignments.ts'
import {
  EAGER_PDB_ENTRIES,
  entryShowing,
  fetchInterProRegions,
  fetchInterfaceRegions,
  fetchLigandSites,
  fetchPdbEntryCount,
  focusFamily,
  focusFromPreset,
  focusLabel,
} from '../website/src/components/proteinFeatures.ts'
import { launchPlan } from '../website/src/components/proteinLaunch.ts'
import { PDB_ID } from '../website/src/components/proteinSession.ts'

import type { ExampleFocus } from '../website/src/components/geneExamples.ts'
import type { GeneStructure } from '../website/src/components/geneStructure.ts'
import type { LaunchInputs } from '../website/src/components/proteinLaunch.ts'

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

// Every launch finds its genome through this generated, gitignored index, and
// without it each gene fails as "this site does not serve" its assembly.
const ORTHOLOG_INDEX = path.join(PUBLIC, 'ortholog_index.json')
if (!fs.existsSync(ORTHOLOG_INDEX)) {
  console.error(
    `${ORTHOLOG_INDEX} is missing; run \`pnpm --filter website2 generate-ortholog-index\` first`,
  )
  process.exit(2)
}

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

// BRCA2 is no chip, but it is past AlphaFold's length cap, so it keeps the
// card's PDB fallback under test. KMT2A and PAX6 launch a MANE isoform that is
// not UniProt's canonical, the case where the map's numbering and the
// translation's differ, which no chip reaches; the seed's residue mark was 14
// off on PAX6 until 2026-10-10.
const genes = values.genes?.split(',') ?? [
  ...examplesFor(REF).map(e => e.symbol),
  ...(REF === 9606 ? ['BRCA2', 'KMT2A', 'PAX6'] : []),
]

// The builder targets JBROWSE_BASE; retarget to the host under test.
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
      // an inline alignment the session carries: the MsaView must come up
      // with this many rows, linked to the genome view
      expectMsaRows?: number
      // an alignment the plugin builds on open (NCBI's orthologs, UniRef):
      // the MsaView must come up with rows of its own, linked
      expectBuiltMsa?: boolean
      // a focus the session opens on: the structure must hold a selection,
      // and when given, exactly these residues (letter and author number)
      expectSelection?: boolean
      expectSelected?: string[]
      // an edit lights the residues it removes: at least this many
      expectSelectedAtLeast?: number
      // the canonical, when the structure numbers residues as UniProt does:
      // each lit residue's letter must be the canonical's at its number
      expectLettersOf?: string
    }

// A focused launch: a chip's preset, or one of NUMBERING_CASES. `pdbId`
// opens another structure than the card's default.
interface FocusCase {
  focus: ExampleFocus
  pdbId?: string
  selects?: string[]
  // the PDB entry this case opens numbers its chain as UniProt does
  numberedAsUniProt?: boolean
}

// Focuses no chip reaches, each a numbering the page used to work out from
// SIFTS before handing the plugin a range: a crystal counted from the mature
// protein, an interface lit as its contact runs in the complex, and a gene
// whose MANE translation is not the canonical and has no AlphaFold model to
// say so.
// What a chip's own PDB entry lights, by author number: 3KMD counts TP53 as
// UniProt does, 1UWH counts BRAF on the old reference where V600E was V599E,
// and 2HBS is sickle haemoglobin, Val6 counted from the mature chain.
const CHIP_SELECTS: Record<string, string[]> = {
  '3kmd': ['R248'],
  '1uwh': ['V599'],
  '2hbs': ['V6'],
}

const NUMBERING_CASES: Record<string, FocusCase[]> =
  REF === 9606
    ? {
        HBB: [
          {
            focus: { residue: 7, residueLabel: 'E6V (Glu7)' },
            pdbId: '2hhb',
            selects: ['E6'],
          },
        ],
        TP53: [
          { focus: { partner: 'P04637' }, numberedAsUniProt: true },
          { focus: { partner: 'Q12888' }, numberedAsUniProt: true },
        ],
        KMT2A: [{ focus: { partner: 'P61964' }, numberedAsUniProt: true }],
        // inside the paired domain, after the 14 residues isoform b's exon 5a
        // adds: the focus carries onto the translation and opens the seed
        PAX6: [{ focus: { residue: 100 } }],
        // a typed residue with no entry named: the card opens the entry PDBe
        // has seen it touching something in, and a stop there opens on the
        // residues it removes
        BRAF: [
          { focus: { residue: 600, residueLabel: 'V600' } },
          { focus: { residue: 600, residueLabel: 'V600*', edit: 'stop' } },
        ],
      }
    : {}

// A focused launch built the way the card builds it: the focus resolved
// against InterPro (and PDBe, for a partner), the domain's Pfam seed as the
// alignment when there is one, the complex as the structure when the focus is
// an interface, and the focus carried onto the launched translation and lit on
// open. This is the session whose mapping the unit tests cannot see — a seed
// row linked through the transcript at its offset, a residue highlight in row
// coordinates, a selection resolved onto the structure — so it is booted too.
async function focusedLaunch(
  gene: string,
  structure: GeneStructure,
  { focus: preset, pdbId, selects, numberedAsUniProt }: FocusCase,
): Promise<Launch> {
  const regions = structure.uniprotId
    ? await fetchInterProRegions(structure.uniprotId)
    : []
  // the page reads a list its preset names, and both for a residue on a
  // protein under EAGER_PDB_ENTRIES
  const { uniprotId } = structure
  const forSentence =
    !!uniprotId &&
    !!preset.residue &&
    (await fetchPdbEntryCount(uniprotId)) <= EAGER_PDB_ENTRIES
  const partners =
    uniprotId && (preset.partner || forSentence)
      ? await fetchInterfaceRegions(uniprotId)
      : undefined
  const ligands =
    uniprotId && (preset.ligand || forSentence)
      ? await fetchLigandSites(uniprotId)
      : undefined
  const focus = focusFromPreset(preset, regions, partners, ligands)
  if (!focus) {
    return {
      name: `${gene} focused`,
      resolveError: `the focus ${JSON.stringify(preset)} matched nothing`,
    }
  }
  const alignment = await loadLaunchAlignment(
    structure,
    focusFamily(focus, regions),
  )
  const launched = { ...structure, ...alignment.structureOverrides }
  const inputs = {
    structure,
    launched,
    alignment,
    focus,
    structureChoice: pdbId,
    residueEntry:
      focus.kind === 'residue'
        ? entryShowing(focus.position, partners, ligands)
        : undefined,
  }
  const residuePlan = launchPlan(inputs)
  const edit = focus.kind === 'residue' ? focus.edit : undefined
  const consequence =
    edit && residuePlan.residueSelection?.[0] && launched.proteinSequence
      ? editConsequence(
          launched.transcript,
          launched.proteinSequence.length,
          residuePlan.residueSelection[0].start,
          edit,
        )
      : undefined
  if (edit && !consequence) {
    return {
      name: `${gene} focused`,
      resolveError: `no ${edit} consequence at residue ${focusLabel(focus)}`,
    }
  }
  const plan = await planWithBestEntry({ ...inputs, consequence })
  const pdbChosen = PDB_ID.test(plan.chosen)
  const canonical = canonicalSequence(structure)
  const opened = `on ${focusLabel(focus)}${consequence ? `, ${edit} removing ${consequence.lost[0]!.start}–${consequence.lost[0]!.end}` : ''}, ${alignment.carries}${pdbChosen ? `, PDB ${plan.chosen}` : ''}`
  return {
    name: `${gene} ${opened}`,
    url: retarget(plan.url),
    expectStructure: !!plan.primary,
    expectGeneTrack: !!structure.target.geneTrackId,
    expectExact: plan.identical,
    expectMsaRows: alignment.rowCount,
    expectBuiltMsa: alignment.source.kind === 'built',
    expectSelection: !!plan.primary && !!plan.selection,
    expectSelected: consequence ? undefined : selects,
    expectSelectedAtLeast: consequence ? 10 : undefined,
    expectLettersOf: (
      pdbChosen
        ? numberedAsUniProt
        : plan.predicted && !plan.model?.accession.includes('-')
    )
      ? canonical
      : undefined,
  }
}

// The card lists experimental entries only when nothing else decides the
// structure (BRCA2 is past AlphaFold's length cap and has 17 PDBe entries).
async function planWithBestEntry(inputs: LaunchInputs) {
  const plan = launchPlan(inputs)
  const { uniprotId } = inputs.structure
  return plan.needsList && uniprotId
    ? launchPlan({
        ...inputs,
        bestEntry: (await fetchExperimentalStructures(uniprotId))[0]?.pdbId,
      })
    : plan
}

const launches: Launch[] = []
for (const gene of genes) {
  try {
    const structure = await fetchGeneStructure(gene, REF)
    const orthologs = await loadLaunchAlignment(structure, undefined)
    const plan = await planWithBestEntry({
      structure,
      launched: { ...structure, ...orthologs.structureOverrides },
      alignment: orthologs,
      focus: undefined,
    })
    const structureName = plan.predicted
      ? (plan.model?.entity ?? plan.model?.accession)
      : PDB_ID.test(plan.chosen)
        ? `PDB ${plan.chosen}`
        : 'no structure'
    launches.push({
      name: `${gene} (${structure.transcript.name}, ${structureName}, ${orthologs.carries})`,
      url: retarget(plan.url),
      expectStructure: !!plan.primary,
      expectGeneTrack: !!structure.target.geneTrackId,
      expectExact: plan.identical,
      expectMsaRows: orthologs.rowCount,
      expectBuiltMsa: orthologs.source.kind === 'built',
    })
    const chip = examplesFor(REF).find(e => e.symbol === gene)
    for (const focusCase of [
      ...(chip?.focus
        ? [
            {
              focus: chip.focus,
              pdbId: chip.structure,
              selects: chip.structure
                ? CHIP_SELECTS[chip.structure]
                : undefined,
            },
          ]
        : []),
      ...(NUMBERING_CASES[gene] ?? []),
    ]) {
      launches.push(await focusedLaunch(gene, structure, focusCase))
    }
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
  clickedStructureRanges?: { start: number; end: number }[]
  mappedStructureSeq?: string
  residueNumber?: (pos: number) => number
}
interface ViewState {
  type: string
  tracks?: unknown[]
  error?: unknown
  structures?: StructureState[]
  // MsaView: react-msaview's row count once the data is parsed, and the
  // codon mapping the connected transcript gives it
  numRows?: number
  dataInitialized?: boolean
  transcriptToMsaMap?: unknown
  connectedViewId?: string
}
interface RootModelState {
  session?: { views?: ViewState[] }
}

// Tall enough for every view of a stacked session to be on screen. Measured
// 2026-09-12 on `main`: the same TP53 launch reports `protein-view-ready` and
// an exact alignment in 6 s at 1400×1000, and never at puppeteer's default
// 800×600, where the structure view sits below the fold — so every launch
// read as a timeout, or as a structure that never aligned.
//
// EBI's proteins API answers a `HeadlessChrome` user agent with no response at
// all, so the browser passes for an ordinary one (as protein3d's e2e does).
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const browser = await launch({
  executablePath: findChrome(),
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--user-agent=${USER_AGENT}`,
  ],
  defaultViewport: { width: 1400, height: 1400 },
})

// Residues read back as `R248`; the first and last few when there are many.
function compactResidues(residues: string[]) {
  return residues.length > 40
    ? `${residues.slice(0, 6).join(',')} … ${residues.slice(-6).join(',')}`
    : residues.join(',')
}

let failures = 0
const selections = new Map<string, string[]>()
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
      // A built alignment fetches and aligns its rows after that; wait for
      // them, or for the error, rather than reading an empty view as a pass.
      if (launchSpec.expectBuiltMsa) {
        await page
          .waitForFunction(
            () => {
              const root: RootModelState | undefined = Reflect.get(
                window,
                'JBrowseRootModel',
              )
              const msa = root?.session?.views?.find(v => v.type === 'MsaView')
              return !msa || !!msa.error || !!msa.dataInitialized
            },
            { timeout: TIMEOUT },
          )
          .catch(() => undefined)
      }

      const state = await page.evaluate(() => {
        const root: RootModelState | undefined = Reflect.get(
          window,
          'JBrowseRootModel',
        )
        const views = root?.session?.views ?? []
        const protein = views.find(v => v.type === 'ProteinView')
        const msa = views.find(v => v.type === 'MsaView')
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
          msa: msa
            ? {
                error: msa.error ? `${msa.error}` : undefined,
                rows: msa.dataInitialized ? (msa.numRows ?? 0) : 0,
                linked: !!msa.transcriptToMsaMap && !!msa.connectedViewId,
              }
            : undefined,
          protein: protein
            ? {
                error: protein.error ? `${protein.error}` : undefined,
                structures: (protein.structures ?? []).map(s => ({
                  url: s.url,
                  aligned: !!s.pairwiseAlignment,
                  exactMatch: s.exactMatch,
                  error: s.error ? `${s.error}` : undefined,
                  // every selected residue as its letter and author number
                  selected: (s.clickedStructureRanges ?? []).flatMap(r =>
                    Array.from(
                      { length: r.end - r.start },
                      (_, i) =>
                        `${s.mappedStructureSeq?.[r.start + i] ?? '?'}${s.residueNumber?.(r.start + i) ?? '?'}`,
                    ),
                  ),
                })),
              }
            : undefined,
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
        } else if (launchSpec.expectSelection && s.selected.length === 0) {
          problems.push('the focus lit nothing on the structure')
        } else if (
          launchSpec.expectSelected &&
          s.selected.join(',') !== launchSpec.expectSelected.join(',')
        ) {
          problems.push(
            `the focus lit ${s.selected.join(',')}, not ${launchSpec.expectSelected.join(',')}`,
          )
        } else if (
          launchSpec.expectSelectedAtLeast !== undefined &&
          s.selected.length < launchSpec.expectSelectedAtLeast
        ) {
          problems.push(
            `the edit lit ${s.selected.length} residues, fewer than the ${launchSpec.expectSelectedAtLeast} expected`,
          )
        }
        if (launchSpec.expectSelection) {
          selections.set(launchSpec.name, s?.selected ?? [])
        }
        const letters = launchSpec.expectLettersOf
        const misread = letters
          ? (s?.selected ?? []).filter(
              r => letters[Number(r.slice(1)) - 1] !== r[0],
            )
          : []
        if (misread.length) {
          problems.push(
            `lit ${misread.join(',')}, whose letters are not the canonical's at those numbers`,
          )
        }
      }
      if (launchSpec.expectBuiltMsa) {
        if (!state.msa) {
          problems.push('no MsaView in the session')
        } else if (state.msa.error) {
          problems.push(`MsaView error: ${state.msa.error}`)
        } else if (state.msa.rows < 2) {
          problems.push(
            `the built alignment came up with ${state.msa.rows} rows`,
          )
        } else if (!state.msa.linked) {
          problems.push(
            'the alignment is not linked to the genome view (no transcript mapping)',
          )
        }
      }
      if (launchSpec.expectMsaRows !== undefined) {
        if (!state.msa) {
          problems.push('no MsaView in the session')
        } else if (state.msa.error) {
          problems.push(`MsaView error: ${state.msa.error}`)
        } else if (state.msa.rows !== launchSpec.expectMsaRows) {
          problems.push(
            `the alignment came up with ${state.msa.rows} rows, not the ${launchSpec.expectMsaRows} the page placed`,
          )
        } else if (!state.msa.linked) {
          problems.push(
            'the alignment is not linked to the genome view (no transcript mapping)',
          )
        }
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
  const selected = selections.get(launchSpec.name)
  if (selected?.length) {
    console.log(
      `       lit ${selected.length} residues: ${compactResidues(selected)}`,
    )
  }
}

await browser.close()
console.log(
  failures
    ? `${failures}/${launches.length} launches failed on ${HOST}`
    : `all ${launches.length} launches boot on ${HOST}`,
)
process.exit(failures ? 1 : 0)
