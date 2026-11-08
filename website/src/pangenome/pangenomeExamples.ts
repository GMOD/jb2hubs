// The examples under the region box on /pangenomes/<id>: a short row of names,
// each of which asks the box for its window.

import { overlapsAllele } from './pangenomeKnownAlleles.ts'
import { formatRegion } from './pangenomeRegion.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'

export interface PangenomeExample {
  id: string
  label: string
  description: string
  // The window the example asks for, as the box takes it.
  region: string
  // The names of the known alleles in it.
  alleles: string[]
}

export function pangenomeExamples(
  dataset: PangenomeDataset,
): PangenomeExample[] {
  return dataset.loci
    .filter(l => !l.unlisted)
    .map(l => ({
      id: l.id,
      label: l.gene,
      description: l.fullName,
      region: formatRegion(l),
      alleles: dataset.knownAlleles
        .filter(a => overlapsAllele(a, l))
        .map(a => a.name),
    }))
}
