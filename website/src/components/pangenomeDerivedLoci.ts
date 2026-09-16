// Turn a derived locus catalogue into the shape the pages render.
//
// `website/generatePangenomeLoci.ts` ranks a graph's coarse tier by segments per
// bubble and names each entry off the reference annotation, writing
// `public/pangenome-<id>/loci.json`. That file is the whole of what is known
// about those loci: there is no prose, no curated variation class, no pangene
// matrix and no per-locus callset summary, because nothing computed one. This
// maps it onto `PangenomeLocus` without inventing any of that.
//
// Which is the point of the `derived` field rather than a dataset-level flag:
// the table needs to know, per locus, that the tier's numbers are all there
// is — HPRC's catalogue is curated, and a dataset could one day hold both.

import type { PangenomeLocus } from './pangenomeLoci.ts'

// One row of `public/pangenome-<id>/loci.json`, as the generator writes it.
export interface DerivedLocusEntry {
  id: string
  gene: string
  fullName: string
  chrom: string
  start: number
  end: number
  segments: number
  shortestAllele: number
  longestAllele: number
  inversion: boolean
  drawable: boolean
  genes: string[]
}

export interface DerivedLociFile {
  dataset: string
  source: string
  generated: string
  loci: DerivedLocusEntry[]
}

// `drawable` is deliberately NOT carried over. It is `end - start <= 150 kb`,
// which is exactly what `detailWindow()` already computes from the coordinates,
// and a second copy of a derived boolean is a second thing to keep in step.
export function derivedLoci(file: DerivedLociFile): PangenomeLocus[] {
  return file.loci.map(l => ({
    id: l.id,
    gene: l.gene,
    fullName: l.fullName,
    chrom: l.chrom,
    start: l.start,
    end: l.end,
    // The tier records an inversion flag per bubble and nothing else about the
    // KIND of variation, so that is the only class claimable here. An empty
    // list is the honest answer for the rest: a blank cell beats a guessed
    // class.
    variation: l.inversion ? ['inversion'] : [],
    derived: {
      segments: l.segments,
      shortestAllele: l.shortestAllele,
      longestAllele: l.longestAllele,
      genes: l.genes,
    },
  }))
}
