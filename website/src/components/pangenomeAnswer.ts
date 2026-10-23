// What the region box on /pangenomes/<id> answers: the window a gene or region
// names, what it opens as, and where the dataset publishes a structural-state
// sidecar, the forms its haplotypes carry there. `check-pangenome-launches`
// asks the same function, so it boots what the page offers; a focused row opens
// the Haplotypes launch's lanes in another order.

import { regionLaunches } from './pangenomeLinks.ts'
import { isWide } from './pangenomeLoci.ts'
import { structuralPanel } from './pangenomePanels.ts'
import {
  formatRegion,
  genesInWindow,
  placeRegion,
  resolveRegion,
  wholeSequence,
} from './pangenomeRegion.ts'
import { minCarriersFor, structuralForms } from './pangenomeSvStates.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeExample } from './pangenomeExamples.ts'
import type { LaunchLink, MatrixRows } from './pangenomeLinks.ts'
import type { StructuralPanel } from './pangenomePanels.ts'
import type { ParsedRegion, WindowGene } from './pangenomeRegion.ts'

export interface Reading {
  // the graph's walks where it publishes a walk file, else the callset's sidecar
  source: 'walks' | 'callset'
  haplotypes: number
  // Undefined where nothing in the window tells the haplotypes apart.
  panel?: StructuralPanel
  sites: number
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

// A walk read too large to expand, or past its deadline on a slow machine: the
// callset's sidecar answers that window instead, until the walk file states
// its abridged walks' departures. Tested by name, which survives the worker.
const tooSlow = (e: unknown) =>
  e instanceof Error &&
  (e.name === 'WalkFormsTooLarge' || e.name === 'WalkFormsTooSlow')

// A window's forms from the graph's own walks where it has a walk file, which
// give exact lengths, else from the callset's sidecar. Either reader, and
// @gmod/tabix with it, loads on the first reading rather than with the page.
async function readStructuralForms(
  dataset: PangenomeDataset,
  region: ParsedRegion,
  signal?: AbortSignal,
) {
  if (dataset.walksUrl) {
    try {
      return await readWalks(dataset.walksUrl, region, signal)
    } catch (e) {
      if (!dataset.svStatesUrl || !tooSlow(e)) {
        throw e
      }
    }
  }
  const { openSvStates } = await import('./pangenomeSvStatesFile.ts')
  const { haplotypes, rows } = await openSvStates(dataset.svStatesUrl!).query(
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

// The map draws a window narrow enough for segment-level forms, and only where
// the dataset has walks or a sidecar to read them from.
const drawsMap = (dataset: PangenomeDataset, region: ParsedRegion) =>
  (!!dataset.svStatesUrl || !!dataset.walksUrl) && !isWide(region)

async function readForms(
  dataset: PangenomeDataset,
  region: ParsedRegion,
  signal?: AbortSignal,
): Promise<Reading | undefined> {
  if (!drawsMap(dataset, region)) {
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
    }),
    sites: forms.sites,
    rareCarriers: forms.rareCarriers.length,
    nonReferenceMajority: forms.nonReferenceMajority,
    matrixRows: {
      order: forms.forms.flatMap(f => f.members),
      omitted: forms.unplaced,
    },
  }
}

// The box's deadline, or a question dropped for the next, is the answer's to
// report; a read that fails otherwise falls back.
const cancelled = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === 'TimeoutError' || error.name === 'AbortError')

function unlessCancelled<T>(fallback: T) {
  return (error: unknown) => {
    if (cancelled(error)) {
      throw error
    }
    return fallback
  }
}

// Genes dress the glyph, so a failed lookup draws it without them.
async function readGenes(
  dataset: PangenomeDataset,
  region: ParsedRegion,
  signal?: AbortSignal,
) {
  if (!drawsMap(dataset, region)) {
    return []
  }
  const { geneGffUrl, taxonId } = dataset.reference
  if (!geneGffUrl) {
    return genesInWindow(region, taxonId, { signal }).catch(unlessCancelled([]))
  }
  const { refSeqGenesInWindow } = await import('./pangenomeRefSeqGenes.ts')
  return refSeqGenesInWindow(geneGffUrl, region, signal).catch(
    unlessCancelled([]),
  )
}

// An example asked for by its label or one of its genes: GSTT1 sits on an alt
// contig that mygene places on no chromosome, and LPA's own span with flanks
// is wider than the map draws, while their examples answer both.
export function exampleFor(examples: PangenomeExample[], text: string) {
  const asked = text.trim()
  const lower = asked.toLowerCase()
  return examples.find(
    e =>
      e.region === asked ||
      e.label.toLowerCase() === lower ||
      e.label.split(/[\s/,()]+/).some(t => t.toLowerCase() === lower),
  )
}

export async function regionAnswer(
  dataset: PangenomeDataset,
  examples: PangenomeExample[],
  text: string,
  signal?: AbortSignal,
): Promise<RegionAnswer> {
  // A sequence name first: "4" is chr4, not a token of HPRC's "PGA3/4/5", and
  // "chr4" Arabidopsis's Chr4, not its "Chr4 knob".
  const whole = wholeSequence(text, dataset.graphBrowser.chromosomes)
  const example = whole ? undefined : exampleFor(examples, text)
  const asked =
    whole ??
    (await resolveRegion(example?.region ?? text, dataset.reference.taxonId, {
      signal,
    }))
  if (!asked) {
    throw new Error(
      `"${text}" is neither a region nor a gene placed on ${dataset.reference.label}`,
    )
  }
  const { symbol, gene, ...placed } = asked
  const region = placeRegion(placed, dataset.graphBrowser.chromosomes)
  if (!region) {
    throw new Error(`${formatRegion(asked)} is not in the graph`)
  }
  const title = example?.label ?? symbol
  const [forms, listed] = await Promise.all([
    readForms(dataset, region, signal).then(
      reading => ({ reading, formsError: undefined }),
      unlessCancelled({ reading: undefined, formsError: true as const }),
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
  // names cattle's BoLA-DQ genes BOLA-.
  const asks = symbol
    ? [symbol]
    : (example?.label.split(/[\s/,()]+/) ?? []).filter(t =>
        /^[A-Za-z][A-Za-z0-9-]{2,}$/.test(t),
      )
  return {
    region,
    title,
    genes,
    named: genes
      .filter(g =>
        symbol
          ? g.symbol === symbol
          : asks.some(t => g.symbol.toUpperCase().startsWith(t.toUpperCase())),
      )
      .map(g => g.symbol),
    example,
    reading,
    formsError,
    launches: regionLaunches(
      dataset,
      { ...region, label: title ?? formatRegion(region) },
      reading?.panel?.lanes.map(l => l.haplotype),
      reading?.matrixRows,
      reading?.panel?.laneHaplotypes,
    ),
  }
}
