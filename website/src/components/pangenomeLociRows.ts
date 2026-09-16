// The loci table on /pangenomes/<id>: one row per catalogue entry with the
// launches it has on this build. Built at page render, so the page carries no
// client JavaScript for it.

import { geneHubUrl, graphLocusUrl, locusLaunchUrl } from './pangenomeLinks.ts'
import { VARIATION_LABELS, locusRegion } from './pangenomeLoci.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'

export interface LocusRow {
  gene: string
  // Curated entries only: a derived entry's `fullName` is its region string.
  description?: string
  variation: string
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
    gene: locus.gene,
    description: locus.derived ? undefined : locus.fullName,
    variation: locus.variation.map(v => VARIATION_LABELS[v]).join(', '),
    region: locusRegion(locus),
    segments: locus.derived?.segments,
    graphUrl: graphLocusUrl(dataset, locus),
    linearUrl: locusLaunchUrl(dataset, locus),
    geneHubUrl: geneHubUrl(dataset, locus),
  }))
}

// Which optional columns the table draws: a column no row fills is not drawn.
export function lociColumns(rows: LocusRow[]) {
  const any = (key: keyof LocusRow) => rows.some(r => r[key] !== undefined)
  return {
    description: any('description'),
    variation: rows.some(r => r.variation !== ''),
    segments: any('segments'),
    launches: any('graphUrl') || any('linearUrl') || any('geneHubUrl'),
  }
}
