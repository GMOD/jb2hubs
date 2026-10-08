// The examples under the region box on /pangenomes/<id>: a short row of names,
// each of which asks the box for its window.

import { formatRegion } from './pangenomeRegion.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'

export interface PangenomeExample {
  id: string
  label: string
  description: string
  // The window the example asks for, as the box takes it.
  region: string
}

export function pangenomeExamples(
  dataset: PangenomeDataset,
): PangenomeExample[] {
  return dataset.loci.map(l => ({
    id: l.id,
    label: l.gene,
    description: l.fullName,
    region: formatRegion(l),
  }))
}
