// What the region box on /pangenomes/<id> answers: the window a gene or region
// names, what it opens as, and where the dataset publishes a structural-state
// sidecar, the forms its haplotypes carry there. `check-pangenome-launches`
// asks the same function, so it boots what the page offers; a focused row opens
// the Haplotypes launch's lanes in another order.

import { overlapsAllele } from './pangenomeKnownAlleles.ts'
import { haplotypeLanesForRegion, regionLaunches } from './pangenomeLinks.ts'
import { structuralPanel } from './pangenomePanels.ts'
import {
  formatRegion,
  placeRegion,
  resolveRegion,
  sequenceNames,
  typedRefName,
  wholeSequence,
} from './pangenomeRegion.ts'
import { minCarriersFor, structuralForms } from './pangenomeSvStates.ts'
import { isWide } from './pangenomeWindow.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeExample } from './pangenomeExamples.ts'
import type { KnownAllele } from './pangenomeKnownAlleles.ts'
import type { LaunchLink, MatrixRows } from './pangenomeLinks.ts'
import type { StructuralPanel } from './pangenomePanels.ts'
import type { ParsedRegion, WindowGene } from './pangenomeRegion.ts'

export interface Reading {
  // the graph's walks where it publishes a walk file, else the callset's sidecar
  source: 'walks' | 'callset'
  haplotypes: number
  // Undefined where nothing in the window tells the haplotypes apart.
  panel?: StructuralPanel
  rareCarriers: number
  nonReferenceMajority: number
  matrixRows: MatrixRows
}

export interface RegionAnswer {
  region: ParsedRegion
  // The example's name or the gene's symbol; a bare region has none.
  title?: string
  // Drawn where there is a reading; `named` are those the question names.
  genes: WindowGene[]
  named: string[]
  example?: PangenomeExample
  // The dataset's known alleles in the window, unless it is too wide for any
  // one to be what it is about.
  alleles: KnownAllele[]
  // Undefined without a sidecar, and past MAX_DETAIL_WINDOW_BP, where the forms
  // would be hundreds of singletons.
  reading?: Reading
  formsError?: true
  launches: LaunchLink[]
}

async function readWalks(
  walksUrl: string,
  region: ParsedRegion,
  signal?: AbortSignal,
) {
  const { walkForms } = await import('./pangenomeWalkFormsClient.ts')
  const forms = await walkForms({ walksUrl, region }, signal)
  const placed = forms.forms.reduce((n, f) => n + f.members.length, 0)
  return {
    source: 'walks' as const,
    haplotypes: placed + forms.unplaced.length,
    forms,
  }
}

// A walk read past gfa-tabix's budgets, or past its deadline on a slow
// machine, or one whose worker or file failed: the callset's sidecar answers
// that window instead. Tested by name, which survives the worker.
const WALKS_UNREAD = new Set([
  'WalkFormsTooLarge',
  'WalkFormsTooSlow',
  'WorkerFailed',
  'HttpError',
  'FileUnreachable',
  'NotInFile',
])

const walksUnread = (e: unknown) =>
  e instanceof Error && WALKS_UNREAD.has(e.name)

async function readCallset(
  svStatesUrl: string,
  region: ParsedRegion,
  signal?: AbortSignal,
) {
  const { openSvStates } = await import('./pangenomeSvStatesFile.ts')
  const { haplotypes, rows } = await openSvStates(svStatesUrl).query(
    region.chrom,
    region.start,
    region.end,
    signal,
  )
  return {
    source: 'callset' as const,
    haplotypes: haplotypes.length,
    forms: structuralForms(rows, haplotypes, minCarriersFor(haplotypes.length)),
  }
}

// A window's forms from the graph's own walks where it has a walk file, which
// give exact lengths, else from the callset's sidecar. Either reader, and
// @gmod/tabix with it, loads on the first reading rather than with the page.
function readStructuralForms(
  dataset: PangenomeDataset,
  region: ParsedRegion,
  signal?: AbortSignal,
) {
  const { walksUrl, svStatesUrl } = dataset
  const fromCallset = () => readCallset(svStatesUrl, region, signal)
  return walksUrl
    ? readWalks(walksUrl, region, signal).catch((e: unknown) => {
        if (!walksUnread(e)) {
          throw e
        }
        return fromCallset()
      })
    : fromCallset()
}

async function readForms(
  dataset: PangenomeDataset,
  region: ParsedRegion,
  alleles: KnownAllele[],
  signal?: AbortSignal,
): Promise<Reading | undefined> {
  if (isWide(region)) {
    return undefined
  }
  const { source, haplotypes, forms } = await readStructuralForms(
    dataset,
    region,
    signal,
  )
  return {
    source,
    haplotypes,
    panel: structuralPanel(forms, {
      withoutGenes: new Set(dataset.haplotypesWithoutGenes ?? []),
      windowBp: region.end - region.start,
      alleles,
    }),
    rareCarriers: forms.rareCarriers.length,
    nonReferenceMajority: forms.nonReferenceMajority,
    matrixRows: {
      order: forms.forms.flatMap(f => f.members),
      omitted: forms.unplaced,
    },
  }
}

// The box gave up, or the next question dropped this one.
export const cancelled = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === 'TimeoutError' || error.name === 'AbortError')

// A server that refused a read or never answered it, or a file without the
// window's sequence, told apart by name since a name survives the worker
const unreadable = (e: unknown) =>
  e instanceof Error &&
  (e.name === 'HttpError' ||
    e.name === 'FileUnreachable' ||
    e.name === 'NotInFile')

function ifUnreadable<T>(fallback: T) {
  return (error: unknown) => {
    if (!unreadable(error)) {
      throw error
    }
    return fallback
  }
}

// Genes dress the glyph, so an unreadable gene source draws it without them.
async function readGenes(
  dataset: PangenomeDataset,
  region: ParsedRegion,
  signal?: AbortSignal,
) {
  return !isWide(region)
    ? import('./pangenomeRefSeqGenes.ts').then(({ refSeqGenesInWindow }) =>
        refSeqGenesInWindow(
          dataset.reference.geneGffUrl,
          region,
          sequenceNames(region.chrom, dataset.graphBrowser.chromosomes),
          signal,
        ).catch(ifUnreadable([])),
      )
    : []
}

// An example asked for by its label or one of its names: GSTT1 sits on an alt
// contig that mygene places on no chromosome, and LPA's own span with flanks
// is wider than the map draws, while their examples answer both. The names are
// listed, not split out of the label, whose words opened mouse's "Agouti (a)"
// for a typed "a" and cattle's "BoLA class I" for "class". A name of one or
// two letters is matched in its own case, since fly's `w` is white and `W` is
// another gene.
export function exampleFor(examples: PangenomeExample[], text: string) {
  const asked = text.trim()
  const lower = asked.toLowerCase()
  return examples.find(
    e =>
      e.region === asked ||
      [e.label, ...e.names].some(
        name =>
          name === asked || (name.length > 2 && name.toLowerCase() === lower),
      ),
  )
}

export async function regionAnswer(
  dataset: PangenomeDataset,
  examples: PangenomeExample[],
  text: string,
  signal?: AbortSignal,
): Promise<RegionAnswer> {
  // A sequence name as the file writes it first, so no example's name can
  // stand in front of one; in any other case only after no gene has the name.
  const sequences = dataset.graphBrowser.chromosomes
  const whole = wholeSequence(text, sequences, typedRefName)
  const example = whole ? undefined : exampleFor(examples, text)
  const asked =
    whole ??
    (await resolveRegion(example?.region ?? text, symbol =>
      import('./pangenomeGeneIndex.ts').then(({ geneLookup }) =>
        geneLookup(dataset.reference.geneIndexUrl, sequences, signal)(symbol),
      ),
    )) ??
    wholeSequence(text, sequences)
  if (!asked) {
    throw new Error(
      `"${text}" is neither a region nor a gene on one of this graph's sequences`,
    )
  }
  const { symbol, gene, ...placed } = asked
  const region = placeRegion(placed, sequences)
  if (!region) {
    throw new Error(`${formatRegion(asked)} is not in the graph`)
  }
  const title = example?.label ?? symbol
  const alleles = isWide(region)
    ? []
    : dataset.knownAlleles.filter(a => overlapsAllele(a, region))
  const [forms, listed] = await Promise.all([
    readForms(dataset, region, alleles, signal).then(
      reading => ({ reading, formsError: undefined }),
      ifUnreadable({ reading: undefined, formsError: true as const }),
    ),
    readGenes(dataset, region, signal),
  ])
  const { reading, formsError } = forms
  const genes =
    symbol && gene && !listed.some(g => g.symbol === symbol)
      ? [...listed, { symbol, ...gene }]
      : listed
  // An example's label names a family as often as a gene: CFHR, HBA, KIR,
  // DEFB and HLA- name their genes by prefix, and in any case, since RefSeq
  // names cattle's BoLA-DQ genes BOLA-. A word of one or two letters is a
  // gene's whole symbol: HP, mouse's a, fly's w.
  const asks = [
    ...(example?.label.split(/[\s/,()]+/) ?? []),
    ...(example?.names ?? []),
  ].filter(t => /^[A-Za-z][A-Za-z0-9-]*$/.test(t))
  const asksFor = (g: WindowGene) =>
    asks.some(t =>
      t.length > 2
        ? g.symbol.toUpperCase().startsWith(t.toUpperCase())
        : g.symbol === t,
    )
  return {
    region,
    title,
    genes,
    named: genes
      .filter(g => (symbol ? g.symbol === symbol : asksFor(g)))
      .map(g => g.symbol),
    example,
    alleles,
    reading,
    formsError,
    launches: regionLaunches(
      dataset,
      { ...region, label: title ?? formatRegion(region) },
      reading?.panel?.lanes.map(l => l.haplotype),
      reading?.matrixRows,
      reading?.panel?.laneHaplotypes,
      {
        laneAlike: reading?.panel?.laneAlike,
        oneStructure: !!reading && !reading.panel,
      },
    ),
  }
}

// A dataset with neither lanes nor walks has nothing a row could open or draw,
// so its rows are not buttons.
export const rowsFocusable = (dataset: PangenomeDataset) =>
  Boolean(dataset.walksUrl) ||
  Boolean(dataset.graphBrowser.haplotypeLanesTrackId)

// What a focused row opens: the Haplotypes launch's own lanes with its form's
// on top, so a form whose lone lane may draw empty (SMN's net 240 kb) still
// opens beside the others.
export function focusedLaunch(
  dataset: PangenomeDataset,
  { region, title, reading }: RegionAnswer,
  haplotype: string,
) {
  const panel = reading?.panel
  return haplotypeLanesForRegion(
    dataset,
    { ...region, label: title ?? formatRegion(region) },
    [haplotype, ...(panel?.laneHaplotypes ?? []).filter(h => h !== haplotype)],
    haplotype,
    panel?.laneAlike,
  )
}
