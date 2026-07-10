// A pangenome "dataset" descriptor: everything that ties the explorer to one
// specific pangenome graph + reference. All the HPRC/GRCh38-specific constants
// live here (they used to be scattered through pangenomeLinks.ts and the
// components), so standing up a second pangenome — a different human graph, or a
// mouse/plant one — is a matter of adding another PangenomeDataset, not editing
// component internals. The components and link builders read only this shape.

import { PANGENOME_LOCI } from './pangenomeLoci.ts'

import type { PangenomeLocus } from './pangenomeLoci.ts'

export interface PangenomeReference {
  // JBrowse assembly name the graph is projected onto (e.g. 'hg38').
  assembly: string
  // A hosted JBrowse config that already defines `assembly` and its gene track.
  configUrl: string
  // Display name for the reference (e.g. 'GRCh38'); also the MSA reference row.
  label: string
  // Reference gene track in `configUrl`, opened alongside the graph variants.
  geneTrackId: string
  // NCBI taxonomy id of the reference species, for the cross-species gene-order
  // link (so it isn't hardcoded to human 9606).
  taxonId: number
}

export interface PangenomeGraphVcf {
  trackId: string
  name: string
  // CORS-open, tabix-indexed VCF (a co-located .tbi lets JBrowse stream it).
  url: string
}

// A pairwise synteny comparison to a second assembly (e.g. reference vs T2T),
// using a synteny/liftover track that already exists in the merged config.
export interface PangenomeSyntenyTarget {
  assembly: string
  trackId: string
  label: string
}

export interface PangenomeDataset {
  id: string
  // Human-readable graph label, e.g. 'HPRC minigraph-cactus v1.1'.
  label: string
  reference: PangenomeReference
  graphVcf: PangenomeGraphVcf
  // Structural-variation tracks (already in `reference.configUrl`) to open with
  // the graph — these carry the headline insertions/deletions/inversions/dups.
  svTrackIds: string[]
  syntenyTarget?: PangenomeSyntenyTarget
  // URL prefix under which the precomputed per-locus summaries, copy-number
  // matrices, and MSA files are served (e.g. '/pangenome').
  dataPrefix: string
  // Whole-graph landing region for the "browse everything" launch.
  landingRegion: string
  loci: PangenomeLocus[]
}

// The HPRC minigraph-cactus v1.1 graph projected onto GRCh38 — the one dataset
// the explorer ships today.
export const HPRC_DATASET: PangenomeDataset = {
  id: 'hprc-mc-v1.1-grch38',
  label: 'HPRC minigraph-cactus v1.1',
  reference: {
    assembly: 'hg38',
    configUrl: 'https://jbrowse.org/ucsc/hg38/config.json',
    label: 'GRCh38',
    geneTrackId: 'hg38-ncbiRefSeq',
    taxonId: 9606,
  },
  graphVcf: {
    trackId: 'hprc-v1.1-mc-grch38-pangenome-vcf',
    name: 'HPRC pangenome variants (minigraph-cactus v1.1, GRCh38)',
    url: 'https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/freeze1/minigraph-cactus/hprc-v1.1-mc-grch38/hprc-v1.1-mc-grch38.vcfbub.a100k.wave.vcf.gz',
  },
  svTrackIds: [
    'hg38-hprcInsertsV1',
    'hg38-hprcDeletionsV1',
    'hg38-hprcArrInvBedV1',
    'hg38-hprcArrDupBedV1',
  ],
  syntenyTarget: {
    assembly: 'hs1',
    trackId: 'hg38_to_hs1_liftOver',
    label: 'CHM13',
  },
  dataPrefix: '/pangenome',
  landingRegion: 'chr6:29,700,000-33,500,000',
  loci: PANGENOME_LOCI,
}
