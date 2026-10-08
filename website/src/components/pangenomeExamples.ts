// The examples under the region box on /pangenomes/<id>: a short row of names,
// each of which asks the box for its window.

import { launchRegion } from './pangenomeLinks.ts'
import { formatRegion } from './pangenomeRegion.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

export interface PangenomeExample {
  label: string
  description: string
  // The window the example asks for, as the box takes it. For a curated locus
  // it is narrower than the locus: MHC opens its class II stretch, not 5 Mb.
  region: string
  graphCollapsed: boolean
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

export function pangenomeExamples(
  dataset: PangenomeDataset,
): PangenomeExample[] {
  const curated = dataset.loci.filter(l => !l.derived)
  const derived = dataset.loci.flatMap(l =>
    l.derived && l.derived.genes.length > 0
      ? [
          {
            locus: l,
            label: derivedLabel(l, l.derived.genes),
            description: `one bubble of ${l.derived.segments.toLocaleString('en-US')} segments`,
          },
        ]
      : [],
  )
  const named = new Set<string>()
  return [
    ...curated.map(l => ({
      locus: l,
      label: l.gene,
      description: l.fullName ?? '',
    })),
    ...derived
      .filter(d => !named.has(d.label) && named.add(d.label))
      .slice(0, MAX_DERIVED_EXAMPLES),
  ].map(({ locus, label, description }) => ({
    label,
    description,
    region: formatRegion(launchRegion(locus)),
    graphCollapsed: locus.graphCollapsed ?? false,
  }))
}
