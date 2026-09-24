// The loci table on /pangenomes/<id>: one row per catalogue entry with the
// launches it has on this build, built at page render.

import {
  geneHubUrl,
  graphLocusUrl,
  haplotypeLanesUrl,
  launchLinks,
  launchRegion,
  locusLaunchUrl,
} from './pangenomeLinks.ts'
import { VARIATION_LABELS } from './pangenomeLoci.ts'
import { formatRegion } from './pangenomeRegion.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { LaunchLink } from './pangenomeLinks.ts'

export interface LocusRow {
  gene: string
  description?: string
  variation: string
  // The window every launch in the row opens, which for a curated locus is
  // narrower than the locus: MHC's row opens its class II stretch, not 5 Mb.
  // 1-based with separators, the way a browser's location box takes it.
  window: string
  // Derived entries only: the tier's segment count, which is what ranks them.
  segments?: number
  launches: LaunchLink[]
}

export function lociRows(dataset: PangenomeDataset): LocusRow[] {
  return dataset.loci.map(locus => ({
    // The generator labels an intergenic bubble with its coordinate, which the
    // window column already says.
    gene:
      locus.derived && locus.derived.genes.length === 0
        ? 'intergenic'
        : locus.gene,
    description: locus.fullName,
    variation: locus.variation.map(v => VARIATION_LABELS[v]).join(', '),
    window: formatRegion(launchRegion(locus)),
    segments: locus.derived?.segments,
    launches: launchLinks(dataset, {
      graph: graphLocusUrl(dataset, locus),
      linear: locusLaunchUrl(dataset, locus),
      haplotypes: haplotypeLanesUrl(dataset, locus),
      geneHub: geneHubUrl(dataset, locus),
    }),
  }))
}

// Which optional columns the table draws: a column no row fills is not drawn.
// Variation is a curated column: a derived catalogue can only ever claim the
// tier's inversion flag, which on mouse is 1 row of 20 and 19 blanks.
export function lociColumns(rows: LocusRow[]) {
  const description = rows.some(r => r.description !== undefined)
  return {
    description,
    variation: description && rows.some(r => r.variation !== ''),
    segments: rows.some(r => r.segments !== undefined),
    launches: rows.some(r => r.launches.length > 0),
    haplotypes: rows.some(r => r.launches.some(l => l.kind === 'haplotypes')),
  }
}
