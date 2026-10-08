// What the region box on /pangenomes/<id> answers: the window a gene or region
// names, what it opens as, and where the dataset publishes a structural-state
// sidecar, the forms its haplotypes carry there. `check-pangenome-launches`
// asks the same function, so it boots what the page offers.

import { regionLaunches } from './pangenomeLinks.ts'
import { MAX_DETAIL_WINDOW_BP } from './pangenomeLoci.ts'
import { structuralPanel } from './pangenomePanels.ts'
import {
  formatRegion,
  placeRegion,
  resolveRegion,
  wholeSequence,
} from './pangenomeRegion.ts'
import { structuralForms } from './pangenomeSvStates.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeExample } from './pangenomeExamples.ts'
import type { LaunchLink } from './pangenomeLinks.ts'
import type { StructuralPanel } from './pangenomePanels.ts'
import type { ParsedRegion } from './pangenomeRegion.ts'

export interface Reading {
  haplotypes: number
  // Undefined where nothing in the window tells the haplotypes apart.
  panel?: StructuralPanel
  sites: number
  rareCarriers: number
  nonReferenceMajority: number
}

export interface RegionAnswer {
  region: ParsedRegion
  // The example's name or the gene's symbol; a bare region has none.
  title?: string
  example?: PangenomeExample
  // Undefined without a sidecar, and past MAX_DETAIL_WINDOW_BP, where the forms
  // would be hundreds of singletons and the lanes pass the GBZ reader's node
  // limit.
  reading?: Reading
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
    }),
    sites: forms.sites,
    rareCarriers: forms.rareCarriers.length,
    nonReferenceMajority: forms.nonReferenceMajority,
  }
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
  const { symbol, ...placed } = asked
  const region = placeRegion(placed, dataset.graphBrowser.chromosomes)
  if (!region) {
    throw new Error(`${formatRegion(asked)} is not in the graph`)
  }
  const example = examples.find(e => e.region === text)
  const title = example?.label ?? symbol
  const reading = await readForms(dataset, region, signal)
  return {
    region,
    title,
    example,
    reading,
    launches: regionLaunches(
      dataset,
      { ...region, label: title ?? formatRegion(region) },
      reading?.panel?.lanes.map(l => l.haplotype),
    ),
  }
}
