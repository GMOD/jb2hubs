// A pangenome "dataset" descriptor: everything that ties the explorer to one
// specific pangenome graph + reference. All the HPRC/GRCh38-specific constants
// live here (they used to be scattered through pangenomeLinks.ts and the
// components), so standing up a second pangenome — a different human graph, or a
// mouse/plant one — is a matter of adding another PangenomeDataset, not editing
// component internals. The components and link builders read only this shape.

import { features } from '../config/features.ts'
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
  // Optional level-of-detail tier: one node per top-level bubble, which draws a
  // whole chromosome in a few hundred nodes. Enables the chromosome launches.
  tierTrackId?: string
  // Optional segments-per-bubble curve, drawn beside the tier as where the
  // graph varies and by how much.
  bubbleScoreTrackId?: string
  // Chromosomes the tier can draw whole, with their lengths — the view's
  // `maxRegionBp` has to be raised to the span, so the length is needed up
  // front.
  chromosomes?: { name: string; length: number }[]
}

// An external graph browser that deep-links by reference coordinate, for the
// scale the in-browser cut cannot reach: PangyPlot precomputes an odgi layout
// and LOD tiers server-side, so it draws a whole chromosome where the
// GraphGenomeView draws a 5 Mb window at most. Its instance carries its own
// graph build, which is why `graphLabel` is stated beside the url — the
// coordinates line up only because both are on the same reference.
export interface PangenomeExternalGraphBrowser {
  name: string
  baseUrl: string
  graphLabel: string
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
  externalGraphBrowser?: PangenomeExternalGraphBrowser
  loci: PangenomeLocus[]
}

// The config is ours: `website/pangenome-config/hprc-grch38.json`, published
// by `upload.sh` beside it to the jbrowse.org bucket (our own site sends no
// CORS headers, and jbrowse-web fetches the config from the visitor's
// browser). It was seeded from jbrowse.org/demos/hprc/config.json and keeps
// that file's track ids, plus the bubble tier and variability curve the HPRC
// tutorial builds but the demo omits. The data files stay in the demos
// bucket, built in the jbrowse-components repo. Upload before deploying
// staging, or every graph launch fails to fetch its config.
//
// The plugin url is the unversioned entry point, deliberately not one of the
// content-hashed builds beside it: the plugin links an unreleased
// @jbrowse/render-core, so an old bundle stops booting as `main` moves, and
// the unversioned one is what gets rebuilt to follow it.
//
// STAGING ONLY until JBrowse v5 ships, and the reason is settled rather than
// open. The GraphGenomeView bundle boots on `main` and error-pages the whole
// app on the released `latest` (`TypeError: (0,N.createSvgIcon) is not a
// function`) because it reads `createSvgIcon` off the host's re-export map,
// and core only started exposing it there in GMOD/jbrowse-components#5607
// (merged to main 2026-07-23). v4.3.0 shipped 2026-05-21, so no released host
// has it — `git tag --contains` on that merge finds no tag, and v4.3.0's
// `ReExports/modules.ts` has no `@mui/material/SvgIcon` entry at all, only the
// generic lazyMap sweep that exposes the component and no named exports.
//
// The host is the variable, not the bundle: both the content-addressed url
// pinned here and the unversioned one the HPRC tutorial tells readers to paste
// read the util from `JBrowseExports["@mui/material/SvgIcon"]`, so they behave
// identically on a given host. Nothing in this repo or in the plugin needs to
// change — the graph launch deliberately targets v5+ only.
//
// So this is NOT held to the v4.0.0 floor in CLAUDE.md's "Old JBrowse versions
// read these configs": that floor is about the `/ucsc/*` configs on the hosted
// app, and this is a different config on a host we choose per-deploy. It
// reaches `HPRC_DATASET` only under `features.pangenomeGraph`, which is gated
// on `latest` being v5 and on nothing else; every builder and surface treats an
// absent `graphBrowser` as "no hosted graph" and falls back to PangyPlot.
// Exported on its own so a test or probe can exercise the graph launches on a
// build where the flag is off.
export const HPRC_GRAPH_BROWSER: PangenomeGraphBrowser = {
  configUrl: 'https://jbrowse.org/pangenome/hprc-grch38/config.json',
  segmentsTrackId: 'hprc_minigraph_segments',
  bubblesTrackId: 'hprc_minigraph_bubbles',
  geneTrackId: 'hg38_ncbiRefSeq_ucsc',
  allelesTrackId: 'hprc_minigraph_alleles',
  tierTrackId: 'hprc_tier',
  bubbleScoreTrackId: 'hprc_bubble_score',
  // hg38.chrom.sizes, primary chromosomes only: the graph's rGFA has no
  // alts or unplaced contigs to draw.
  chromosomes: [
    { name: 'chr1', length: 248_956_422 },
    { name: 'chr2', length: 242_193_529 },
    { name: 'chr3', length: 198_295_559 },
    { name: 'chr4', length: 190_214_555 },
    { name: 'chr5', length: 181_538_259 },
    { name: 'chr6', length: 170_805_979 },
    { name: 'chr7', length: 159_345_973 },
    { name: 'chr8', length: 145_138_636 },
    { name: 'chr9', length: 138_394_717 },
    { name: 'chr10', length: 133_797_422 },
    { name: 'chr11', length: 135_086_622 },
    { name: 'chr12', length: 133_275_309 },
    { name: 'chr13', length: 114_364_328 },
    { name: 'chr14', length: 107_043_718 },
    { name: 'chr15', length: 101_991_189 },
    { name: 'chr16', length: 90_338_345 },
    { name: 'chr17', length: 83_257_441 },
    { name: 'chr18', length: 80_373_285 },
    { name: 'chr19', length: 58_617_616 },
    { name: 'chr20', length: 64_444_167 },
    { name: 'chr21', length: 46_709_983 },
    { name: 'chr22', length: 50_818_468 },
    { name: 'chrX', length: 156_040_895 },
    { name: 'chrY', length: 57_227_415 },
  ],
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
  graphBrowser: features.pangenomeGraph ? HPRC_GRAPH_BROWSER : undefined,
  // SickKids' public instance, verified answering 2026-08-26. It serves the
  // v1.1 graph, not release 2, so a locus can differ in detail from the graph
  // launch above; GRCh38 coordinates are the same on both.
  externalGraphBrowser: {
    name: 'PangyPlot',
    baseUrl: 'https://pangyplot.research.sickkids.ca/',
    graphLabel: 'HPRC minigraph-cactus v1.1',
  },
  loci: PANGENOME_LOCI,
}
