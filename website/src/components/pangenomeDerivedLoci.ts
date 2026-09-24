// Turn a derived locus catalogue into the shape the pages render.
//
// `website/generatePangenomeLoci.ts` ranks a graph's coarse tier by segments per
// bubble and names each entry off the reference annotation, writing
// `public/pangenome-<id>/loci.json`. That file is the whole of what is known
// about those loci: there is no prose and no curated variation class, because
// nothing wrote one. This maps it onto `PangenomeLocus` without inventing any.
//
// Which is the point of the `derived` field rather than a dataset-level flag:
// the table needs to know, per locus, that the tier's numbers are all there
// is — HPRC's catalogue is curated, and a dataset could one day hold both.

import type { PangenomeLocus } from './pangenomeLoci.ts'

// The fields of one row of `public/pangenome-<id>/loci.json` the pages read.
// Files written before 2026-09-24 carry more, which nothing reads.
export interface DerivedLocusEntry {
  id: string
  gene: string
  chrom: string
  start: number
  end: number
  segments: number
  genes: string[]
}

export interface DerivedLociFile {
  dataset: string
  source: string
  generated: string
  loci: DerivedLocusEntry[]
}

export function derivedLoci(file: DerivedLociFile): PangenomeLocus[] {
  return file.loci.map(l => ({
    id: l.id,
    gene: l.gene,
    chrom: l.chrom,
    start: l.start,
    end: l.end,
    variation: [],
    derived: {
      segments: l.segments,
      genes: l.genes,
    },
  }))
}
