// A pangenome "dataset" descriptor: everything that ties the explorer to one
// specific pangenome graph + reference. All the HPRC/GRCh38-specific constants
// live here (they used to be scattered through pangenomeLinks.ts and the
// components), so standing up a second pangenome — a different human graph, or a
// mouse/plant one — is a matter of adding another PangenomeDataset, not editing
// component internals. The components and link builders read only this shape.

import { ucscConfigPath } from '../config/jbrowse.ts'
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

// The hosted config that can draw the graph itself, as opposed to its
// reference-projected VCF. Deliberately a different config from
// `reference.configUrl`: the GraphGenomeView plugin is declared only here, so a
// dead plugin url costs the graph launch rather than every launch on the site
// (a config's `plugins[]` is the one field that can error-page a whole session).
export interface PangenomeGraphBrowser {
  configUrl: string
  // rGFA segments track the subgraph is cut from
  segmentsTrackId: string
  bubblesTrackId: string
  geneTrackId: string
  // Optional allele-inventory track: one row per allele the graph holds, stated
  // against the reference span it replaces. It carries a CIGAR, so an
  // AlignmentsTrack draws each insertion at its real magnitude rather than as a
  // 1 bp box — which is what makes an allele's size readable beside the graph
  // node it belongs to. Omitted where a graph has no such projection built.
  allelesTrackId?: string
}

export interface PangenomeDataset {
  id: string
  // Human-readable graph label, e.g. 'HPRC minigraph-cactus v2.0'.
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
  // Omitted where a dataset has no hosted graph projection to draw.
  graphBrowser?: PangenomeGraphBrowser
  loci: PangenomeLocus[]
}

// The HPRC minigraph-cactus v2.0 (release 2) graph projected onto GRCh38 — the
// one dataset the explorer ships today. Release 2 is 232 samples against release
// 1's 45, so every precomputed summary under `dataPrefix` has to be regenerated
// alongside a change to `graphVcf` (`node generatePangenomeData.ts`). The three
// generators read `graphVcf.url` from here rather than restating it, so that
// sentence stays true: a changed url can no longer leave them on the old file.
export const HPRC_DATASET: PangenomeDataset = {
  id: 'hprc-mc-v2.0-grch38',
  label: 'HPRC minigraph-cactus v2.0',
  reference: {
    assembly: 'hg38',
    configUrl: ucscConfigPath('hg38'),
    label: 'GRCh38',
    geneTrackId: 'hg38-ncbiRefSeq',
    taxonId: 9606,
  },
  graphVcf: {
    trackId: 'hprc-v2.0-mc-grch38-pangenome-vcf',
    name: 'HPRC pangenome variants (minigraph-cactus v2.0, GRCh38)',
    url: 'https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/release2/minigraph-cactus/hprc-v2.0-mc-grch38.wave.vcf.gz',
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
  // A deliberate wide overview of the MHC — the SV tracks are its subject and
  // they draw across all 3.8 Mb. The callset lane opens gated at this width and
  // releases on zoom-in, which is ordinary JBrowse behaviour for an overview;
  // the per-locus launches open on a window the callset can actually draw (see
  // graphVcfLgvUrl).
  landingRegion: 'chr6:29,700,000-33,500,000',
  // Track ids from jbrowse.org/demos/hprc/config.json, which is the
  // jbrowse-components repo's demos/hprc/config.json — a different repo, so
  // nothing here fails at build time if one is renamed. `pangenomeLinks.test.ts`
  // pins the shape; the ids themselves are checked by opening the launch.
  //
  // STAGING ONLY, and not by our choice: that config pins a content-addressed
  // GraphGenomeView bundle that boots on `main` and error-pages the whole app on
  // the released `latest` (`TypeError: (0,N.createSvgIcon) is not a function`,
  // measured 2026-08-06 — loading the bare config with no session spec fails the
  // same way, so it is the plugin against that host, nothing we send it). Fine
  // today because `features.pangenome` is staging and staging targets `main`.
  // Before flipping that flag, re-check this launch on `latest`, or the graph
  // button ships as an error page. Fixing it is the plugin's job, not this
  // repo's — this is the `plugins[].url` failure mode CLAUDE.md describes, one
  // dead-or-throwing bundle taking down the session.
  graphBrowser: {
    configUrl: 'https://jbrowse.org/demos/hprc/config.json',
    segmentsTrackId: 'hprc_minigraph_segments',
    bubblesTrackId: 'hprc_minigraph_bubbles',
    geneTrackId: 'hg38_ncbiRefSeq_ucsc',
    allelesTrackId: 'hprc_minigraph_alleles',
  },
  loci: PANGENOME_LOCI,
}
