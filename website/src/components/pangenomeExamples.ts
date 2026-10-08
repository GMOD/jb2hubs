// The examples under the region box on /pangenomes/<id>: a short row of names,
// each of which asks the box for its window.

import { formatRegion } from './pangenomeRegion.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

export interface PangenomeExample {
  id: string
  label: string
  description: string
  // The window the example asks for, as the box takes it.
  region: string
}

// A derived catalogue is twenty bubbles ranked by segment count, half of them
// intergenic and nameable only by coordinate. Those are no examples, so a
// derived dataset offers the highest-ranked few that overlap a gene.
export const MAX_DERIVED_EXAMPLES = 8

// The generator's label, cut to a name: "Vmn cluster (18 genes)" is the Vmn
// cluster, and a gene list is its first real symbol and a count, since a LOC id
// names nothing.
function derivedLabel(locus: PangenomeLocus, genes: string[]) {
  const cluster = /^(.+ cluster) \(\d+ genes\)$/.exec(locus.gene)
  if (cluster) {
    return cluster[1]!
  }
  const first = genes.find(g => !g.startsWith('LOC')) ?? genes[0]!
  return genes.length > 1 ? `${first} +${genes.length - 1}` : first
}

function example(
  locus: PangenomeLocus,
  label: string,
  description: string,
): PangenomeExample {
  return {
    id: locus.id,
    label,
    description,
    region: formatRegion(locus),
  }
}

export function pangenomeExamples(
  dataset: PangenomeDataset,
): PangenomeExample[] {
  const named = new Set<string>()
  return [
    ...dataset.loci
      .filter(l => !l.derived)
      .map(l => example(l, l.gene, l.fullName ?? '')),
    ...dataset.loci
      .flatMap(l =>
        l.derived && l.derived.genes.length > 0
          ? [
              example(
                l,
                derivedLabel(l, l.derived.genes),
                `one bubble of ${l.derived.segments.toLocaleString('en-US')} segments`,
              ),
            ]
          : [],
      )
      .filter(e => !named.has(e.label) && named.add(e.label))
      .slice(0, MAX_DERIVED_EXAMPLES),
  ]
}
