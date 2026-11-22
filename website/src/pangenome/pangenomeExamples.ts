// The examples beside the region box on /pangenomes/<id>: a select of names,
// each of which asks the box for its window.

import { formatRegion } from './pangenomeRegion.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'

export interface PangenomeExample {
  id: string
  label: string
  // The names a typed query opens it by, besides the label.
  names: string[]
  description: string
  // The window the example asks for, as the box takes it.
  region: string
}

export function pangenomeExamples(
  dataset: PangenomeDataset,
): PangenomeExample[] {
  return dataset.loci
    .filter(l => !l.unlisted)
    .map(l => ({
      id: l.id,
      label: l.gene,
      names: l.names ?? [],
      description: l.fullName,
      region: formatRegion(l),
    }))
}
