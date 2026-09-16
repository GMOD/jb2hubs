// The loci table on /pangenomes/<id>: one row per catalogue entry with the
// launches it has on this build. Built at page render, so the page carries no
// client JavaScript for it.

import { geneHubUrl, graphLocusUrl, locusLaunchUrl } from './pangenomeLinks.ts'
import { VARIATION_LABELS } from './pangenomeLoci.ts'
import { formatRegion } from './pangenomeRegion.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'

export interface LocusRow {
  gene: string
  // Curated entries only: a derived entry's `fullName` is its region string.
  description?: string
  variation: string
  // 1-based with separators, the way the region box takes it.
  region: string
  // Derived entries only: the tier's segment count, which is what ranks them.
  segments?: number
  graphUrl?: string
  // The callset where the dataset has one, else the graph's own lanes.
  linearUrl?: string
  geneHubUrl?: string
}

export function lociRows(dataset: PangenomeDataset): LocusRow[] {
  return dataset.loci.map(locus => ({
    // The generator labels an intergenic bubble with its coordinate, which the
    // region column already says.
    gene:
      locus.derived && locus.derived.genes.length === 0
        ? 'intergenic'
        : locus.gene,
    description: locus.derived ? undefined : locus.fullName,
    variation: locus.variation.map(v => VARIATION_LABELS[v]).join(', '),
    region: formatRegion(locus.chrom, locus.start, locus.end),
    segments: locus.derived?.segments,
    graphUrl: graphLocusUrl(dataset, locus),
    linearUrl: locusLaunchUrl(dataset, locus),
    geneHubUrl: geneHubUrl(dataset, locus),
  }))
}

// Which optional columns the table draws: a column no row fills is not drawn.
// Variation is a curated column: a derived catalogue can only ever claim the
// tier's inversion flag, which on mouse is 1 row of 20 and 19 blanks.
export function lociColumns(rows: LocusRow[]) {
  const any = (key: keyof LocusRow) => rows.some(r => r[key] !== undefined)
  const description = any('description')
  return {
    description,
    variation: description && rows.some(r => r.variation !== ''),
    segments: any('segments'),
    launches: any('graphUrl') || any('linearUrl') || any('geneHubUrl'),
  }
}
