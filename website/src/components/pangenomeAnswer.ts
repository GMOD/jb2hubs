// What the region box on /pangenomes/<id> answers: the window a gene or region
// names, what it opens as, and where the dataset publishes a structural-state
// sidecar, the forms its haplotypes carry there. `check-pangenome-launches`
// asks the same function, so it boots what the page offers; a focused row opens
// the Haplotypes launch's lanes in another order.

import { regionLaunches } from './pangenomeLinks.ts'
import { MAX_DETAIL_WINDOW_BP } from './pangenomeLoci.ts'
import { structuralPanel } from './pangenomePanels.ts'
import {
  formatRegion,
  genesInWindow,
  placeRegion,
  resolveRegion,
  wholeSequence,
} from './pangenomeRegion.ts'
import { structuralForms } from './pangenomeSvStates.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeExample } from './pangenomeExamples.ts'
import type { LaunchLink, MatrixRows } from './pangenomeLinks.ts'
import type { StructuralPanel } from './pangenomePanels.ts'
import type { ParsedRegion, WindowGene } from './pangenomeRegion.ts'

export interface Reading {
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
  // would be hundreds of singletons and the lanes pass the GBZ reader's node
  // limit.
  reading?: Reading
  formsError?: true
  launches: LaunchLink[]
}

// The sidecar reader, and @gmod/tabix with it, loads on the first reading
// rather than with the page.
async function readForms(
  dataset: PangenomeDataset,
  region: ParsedRegion,
  signal?: AbortSignal,
): Promise<Reading | undefined> {
  if (
    !dataset.svStatesUrl ||
    region.end - region.start > MAX_DETAIL_WINDOW_BP
  ) {
    return undefined
  }
  const { openSvStates } = await import('./pangenomeSvStatesFile.ts')
  const { haplotypes, rows } = await openSvStates(dataset.svStatesUrl).query(
    region.chrom,
    region.start,
    region.end,
    signal,
  )
  const forms = structuralForms(rows, haplotypes)
  return {
    haplotypes: haplotypes.length,
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

// Genes dress the glyph, so a failed lookup draws it without them.
async function readGenes(
  dataset: PangenomeDataset,
  region: ParsedRegion,
  signal?: AbortSignal,
) {
  if (
    !dataset.svStatesUrl ||
    region.end - region.start > MAX_DETAIL_WINDOW_BP
  ) {
    return []
  }
  const { geneGffUrl, taxonId } = dataset.reference
  if (!geneGffUrl) {
    return genesInWindow(region, taxonId, { signal }).catch(() => [])
  }
  const { refSeqGenesInWindow } = await import('./pangenomeRefSeqGenes.ts')
  return refSeqGenesInWindow(geneGffUrl, region, signal).catch(() => [])
}

export async function regionAnswer(
  dataset: PangenomeDataset,
  examples: PangenomeExample[],
  text: string,
  signal?: AbortSignal,
): Promise<RegionAnswer> {
  const asked =
    wholeSequence(text, dataset.graphBrowser.chromosomes) ??
    (await resolveRegion(text, dataset.reference.taxonId, { signal }))
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
  const example = examples.find(e => e.region === text)
  const title = example?.label ?? symbol
  const [forms, listed] = await Promise.all([
    readForms(dataset, region, signal).then(
      reading => ({ reading, formsError: undefined }),
      () => ({ reading: undefined, formsError: true as const }),
    ),
    readGenes(dataset, region, signal),
  ])
  const { reading, formsError } = forms
  const genes =
    symbol && gene && !listed.some(g => g.symbol === symbol)
      ? [...listed, { symbol, ...gene }]
      : listed
  // An example's label names a family as often as a gene: CFHR, HBA, KIR,
  // DEFB and HLA- name their genes by prefix.
  const asks = symbol
    ? [symbol]
    : (example?.label.split(/[\s/,()]+/) ?? []).filter(t =>
        /^[A-Z][A-Z0-9-]{2,}$/.test(t),
      )
  return {
    region,
    title,
    genes,
    named: genes
      .filter(g =>
        symbol ? g.symbol === symbol : asks.some(t => g.symbol.startsWith(t)),
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
    ),
  }
}
