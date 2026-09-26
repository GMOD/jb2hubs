// A pangenome "dataset" descriptor: everything that ties the pages to one
// specific pangenome graph + reference. All the HPRC/GRCh38-specific constants
// live here (they used to be scattered through pangenomeLinks.ts and the
// components), so standing up a second pangenome — a different human graph, or a
// mouse/plant one — is a matter of adding another PangenomeDataset, not editing
// component internals. The components and link builders read only this shape.

import arabidopsisLociFile from '../../public/pangenome-arabidopsis/loci.json' with { type: 'json' }
import bovineLociFile from '../../public/pangenome-bovine/loci.json' with { type: 'json' }
import hprcPanelsFile from '../../public/pangenome-hprc/panels.json' with { type: 'json' }
import mouseLociFile from '../../public/pangenome-mouse/loci.json' with { type: 'json' }
import { features } from '../config/features.ts'
import { genarkConfigPath, ucscConfigPath } from '../config/jbrowse.ts'
import { derivedLoci } from './pangenomeDerivedLoci.ts'
import { PANGENOME_LOCI } from './pangenomeLoci.ts'

import type { PangenomeLocus } from './pangenomeLoci.ts'
import type { StructuralPanel } from './pangenomePanels.ts'

export interface PangenomeReference {
  // JBrowse assembly name the graph is projected onto (e.g. 'hg38').
  assembly: string
  // A hosted JBrowse config that already defines `assembly` and its gene track.
  configUrl: string
  // Display name for the reference (e.g. 'GRCh38').
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
  // Split each sample into its haplotypes on the matrix display. True only for
  // a callset whose genotypes are actually phased: HPRC's 232 diploid samples
  // are 464 haplotype rows, and that is the only form a co-inherited block is
  // visible in. A `vg deconstruct` callset over assembly paths is one haploid
  // row per assembly, and asking for phased there draws every second row empty.
  phased?: boolean
  // A `name`-keyed sample table beside the VCF, whose columns `rowColor` can
  // colour rows by.
  samplesTsvUrl?: string
  rows?: { domain: string[]; labels: Record<string, string> }
  rowColor?: { field: string; domain: string[]; range: string[] }
}

// The hosted config that can draw the graph itself, as opposed to its
// reference-projected VCF. Deliberately a different config from
// `reference.configUrl`: the graph plugin is declared only here, so a
// dead plugin url costs the graph launch rather than every launch on the site
// (a config's `plugins[]` is the one field that can error-page a whole session).
export interface PangenomeGraphBrowser {
  configUrl: string
  // rGFA segments track, which a graph launch opens as the graph
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
  // Chromosomes the tier can draw whole, with the lengths their launches open
  // on.
  chromosomes?: { name: string; length: number }[]
  // Optional GBZ lane track: one lane per haplotype walk, each in its own
  // contig's coordinates, read from the graph database at query time. A locus
  // launch narrows it to the dataset's panel for that locus.
  haplotypeLanesTrackId?: string
  // Optional rearrangements called between the assemblies, opened under the
  // lanes in both tiers: the Arabidopsis graph has no bubble for its chromosome
  // 4 inversion, and SyRI's rows show it.
  rearrangementTrack?: { trackId: string; height: number }
}

// One published file of a graph, for the page's file table.
export interface PangenomePublishedFile {
  suffix: string
  what: string
  bytes: number
}

// The files a graph in this stack can publish, in the order the page tables
// them: the graph, the five projections `build_rgfa_tabix.sh`,
// `build_rgfa_alleles.sh` and `build_bubble_tier.sh` (jbrowse-components) emit
// for any rGFA, and the callset. Shared rather than restated per dataset, which
// is what lets one page table any of the three.
const GRAPH_FILE_KINDS: { suffix: string; what: string }[] = [
  { suffix: '.rgfa.gz', what: 'the graph itself' },
  { suffix: '.segs.bed.gz', what: 'one row per node, with its rank' },
  { suffix: '.links.bed.gz', what: 'one row per edge per endpoint' },
  { suffix: '.bubbles.bed.gz', what: 'gfatools bubble output' },
  {
    suffix: '.alleles.bed.gz',
    what: 'one row per allele, with a CIGAR for its size',
  },
  {
    suffix: '.tier10000.segs.bed.gz',
    what: 'one node per bubble, so a chromosome is drawable',
  },
  { suffix: '.vcf.gz', what: 'the reference-projected callset' },
]

// The table rows for one dataset: the shared file kinds, filtered to the ones
// this dataset actually publishes, with their urls built from its prefix.
export function publishedFiles(
  dataset: PangenomeDataset,
): PangenomePublishedFile[] {
  return GRAPH_FILE_KINDS.flatMap(kind => {
    const bytes = dataset.sizes[kind.suffix]
    return bytes === undefined ? [] : [{ ...kind, bytes }]
  })
}

export interface PangenomeDataset {
  // The last segment of /pangenomes/<id>: short and stable across graph
  // releases, which live in `label`.
  id: string
  // Human-readable graph label, e.g. 'HPRC minigraph-cactus v2.1'.
  label: string
  heading: string
  reference: PangenomeReference
  // One line naming the assemblies the graph was built from, shown wherever the
  // dataset is introduced. A noun phrase with no terminal punctuation and no
  // em-dash, because every caller sets it inside a sentence of its own.
  //
  // Not derived from the callset's sample list: two of the three datasets have
  // no callset, and one of those has no sample list at all in any file we serve.
  panelDescription: string
  // The reference-projected callset, where the graph has one.
  //
  // Absent is a property of the GRAPH, not a gap in the wiring: `vg deconstruct`
  // projects haplotype paths, and `minigraph -cxggs` writes none, so the mouse
  // graph cannot state which strain carries which allele and no callset can be
  // made from it.
  graphVcf?: PangenomeGraphVcf
  // Structural-variation tracks (already in `reference.configUrl`) to open with
  // the graph — these carry the headline insertions/deletions/inversions/dups.
  svTrackIds: string[]
  // Omitted where a dataset has no hosted graph projection to draw.
  graphBrowser?: PangenomeGraphBrowser
  loci: PangenomeLocus[]
  // Per locus id, the haplotypes its lanes launch opens, read from
  // `svStatesUrl` by `generatePangenomePanels.ts`. A locus without one has
  // nothing in its window that tells the haplotypes apart, and gets no
  // haplotypes launch.
  panels?: Record<string, StructuralPanel>
  // The structural-state sidecar of this graph's callset, published by
  // `pangenome-config/buildHprcSvStates.sh`. It is what makes a window nobody
  // precomputed answerable: the page reads it for a region a reader asks for
  // and groups the haplotypes the same way the panels above were grouped.
  svStatesUrl?: string
  // Haplotypes the lane track draws without gene models, so a form is not
  // stood for by one of them where another member would draw its genes.
  // `generatePangenomeHaplotypes.ts` prints them: they are the haplotypes
  // HPRC's CAT index does not annotate.
  haplotypesWithoutGenes?: string[]
  // The tutorial that explains what this graph can show, where one exists. The
  // tutorial is the better explanation — the page's job is to launch it, not
  // to restate it.
  tutorialUrl?: string
  // The published bucket prefix the file table's urls are built from.
  filePrefix: string
  // Bytes per suffix, stated rather than fetched so a static build needs no
  // network, and so as of a measurement named per dataset. A suffix absent here
  // is absent from the table, which is how mouse's callset row stays off the
  // page. `pnpm check-pangenome-assets` probes every url, so a file that MOVED
  // is caught; one that merely grew shows a stale number until re-measured.
  sizes: Record<string, number>
  // Where the assemblies and the graph came from.
  links: { label: string; url: string }[]
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
// open. The graph plugin bundle boots on `main` and error-pages the whole
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
// absent `graphBrowser` as "no hosted graph" and offers no graph link.
// Exported on its own so a test or probe can exercise the graph launches on a
// build where the flag is off.
export const HPRC_GRAPH_BROWSER: PangenomeGraphBrowser = {
  configUrl: 'https://jbrowse.org/pangenome/hprc-grch38/config.json',
  segmentsTrackId: 'hprc_minigraph_segments',
  bubblesTrackId: 'hprc_minigraph_bubbles',
  geneTrackId: 'hg38_ncbiRefSeq_ucsc',
  allelesTrackId: 'hprc_minigraph_alleles',
  tierTrackId: 'hprc_minigraph_tier',
  bubbleScoreTrackId: 'hprc_bubble_score',
  haplotypeLanesTrackId: 'hprc_v2_1_gbz_lanes',
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

// The HPRC minigraph-cactus v2.1 (release 2) graph projected onto GRCh38.
export const HPRC_DATASET: PangenomeDataset = {
  id: 'hprc',
  label: 'HPRC minigraph-cactus v2.1',
  reference: {
    assembly: 'hg38',
    configUrl: ucscConfigPath('hg38'),
    label: 'GRCh38',
    geneTrackId: 'hg38-ncbiRefSeq',
    taxonId: 9606,
  },
  panelDescription:
    '232 phased diploid assemblies from diverse human populations, 464 haplotypes',
  graphVcf: {
    trackId: 'hprc-v2.1-mc-grch38-pangenome-vcf',
    name: 'HPRC pangenome variants (minigraph-cactus v2.1, GRCh38)',
    url: 'https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/release2/minigraph-cactus/v2.1/hprc-v2.1-mc-grch38/hprc-v2.1-mc-grch38.wave.vcf.gz',
    phased: true,
  },
  svTrackIds: [
    'hg38-hprcInsertsV1',
    'hg38-hprcDeletionsV1',
    'hg38-hprcArrInvBedV1',
    'hg38-hprcArrDupBedV1',
  ],
  graphBrowser: features.pangenomeGraph ? HPRC_GRAPH_BROWSER : undefined,
  loci: PANGENOME_LOCI,
  panels: hprcPanelsFile.panels,
  svStatesUrl:
    'https://jbrowse.org/pangenome/hprc-grch38/sv-states/hprc-v2.1-mc-grch38.sv-states.tsv.gz',
  haplotypesWithoutGenes: ['HG002#1', 'HG002#2'],
  heading: 'Human Pangenome Reference Consortium',
  tutorialUrl: 'https://jbrowse.org/jb2/docs/tutorials/pangenome_hprc/',
  filePrefix: 'https://jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38',
  // Measured 2026-09-10 against v2.1. No `.rgfa.gz` row — the graph the
  // projections were cut from is release 2's own `sv.gfa.gz` on S3, linked
  // below rather than re-hosted, and no `.vcf.gz` row for the same reason: the
  // callset the tracks stream is the release's, at its own url.
  sizes: {
    '.segs.bed.gz': 6_686_172,
    '.links.bed.gz': 34_147_909,
    '.bubbles.bed.gz': 61_453_085,
    '.alleles.bed.gz': 5_213_294,
    '.tier10000.segs.bed.gz': 104_044,
  },
  links: [
    { label: 'HPRC', url: 'https://humanpangenome.org/' },
    {
      label: 'Release 2 files',
      url: 'https://github.com/human-pangenomics/hpp_pangenome_resources',
    },
    { label: 'Sample assemblies', url: '/hubs/HPRC' },
    {
      label: 'How the projections were built',
      url: 'https://jbrowse.org/demos/hprc/README.txt',
    },
  ],
}

// Both non-human graphs are hosted and configured exactly like HPRC's, which is
// what makes one component able to render all three: the same five projected
// files under the same suffixes, the same three adapters, the same trackId
// convention. Their configs are `website/pangenome-config/mouse-mm39.json` and
// `bovine-arsucd12.json`, published by `upload.sh` beside them and gated by
// `pnpm check-pangenome-assets`, which since 2026-09-09 also checks that the
// bucket copy exists and matches — `bovine-arsucd12.json` was committed and
// 404 for a day because nothing asked.
//
// Both are staging-only for the same reason HPRC's graph is, and it is a
// stronger reason here: every adapter in this stack (`RgfaTabixAdapter`,
// `MinigraphBubbleAdapter`) ships in the graphgenomeviewer plugin rather than
// in core, so for these two datasets the LINEAR lanes are plugin-gated too, not
// just the graph. Without `graphBrowser` a mouse locus has nothing but its
// coordinates.
const MOUSE_GRAPH_BROWSER: PangenomeGraphBrowser = {
  configUrl: 'https://jbrowse.org/pangenome/mouse-mm39/config.json',
  segmentsTrackId: 'mouse_minigraph_segments',
  bubblesTrackId: 'mouse_minigraph_bubbles',
  geneTrackId: 'mm39_ncbiRefSeq_ucsc',
  allelesTrackId: 'mouse_minigraph_alleles',
  tierTrackId: 'mouse_minigraph_tier',
  bubbleScoreTrackId: 'mouse_bubble_score',
  // The 20 sequences the graph actually holds, read off the tier file's own
  // refNames rather than off mm39's chrom.sizes: `build_mouse_pangenome.sh`
  // aligns one sequence per chromosome, so there is no chrY and no chrM in the
  // graph and a chromosome launch for either would draw an empty pane.
  chromosomes: [
    { name: 'chr1', length: 195_154_279 },
    { name: 'chr2', length: 181_755_017 },
    { name: 'chr3', length: 159_745_316 },
    { name: 'chr4', length: 156_860_686 },
    { name: 'chr5', length: 151_758_149 },
    { name: 'chr6', length: 149_588_044 },
    { name: 'chr7', length: 144_995_196 },
    { name: 'chr8', length: 130_127_694 },
    { name: 'chr9', length: 124_359_700 },
    { name: 'chr10', length: 130_530_862 },
    { name: 'chr11', length: 121_973_369 },
    { name: 'chr12', length: 120_092_757 },
    { name: 'chr13', length: 120_883_175 },
    { name: 'chr14', length: 125_139_656 },
    { name: 'chr15', length: 104_073_951 },
    { name: 'chr16', length: 98_008_968 },
    { name: 'chr17', length: 95_294_699 },
    { name: 'chr18', length: 90_720_763 },
    { name: 'chr19', length: 61_420_004 },
    { name: 'chrX', length: 169_476_592 },
  ],
}

const BOVINE_GRAPH_BROWSER: PangenomeGraphBrowser = {
  configUrl: 'https://jbrowse.org/pangenome/bovine-arsucd12/config.json',
  segmentsTrackId: 'bovine_minigraph_segments',
  bubblesTrackId: 'bovine_minigraph_bubbles',
  geneTrackId: 'bosTau9_ncbiRefSeq_ucsc',
  allelesTrackId: 'bovine_minigraph_alleles',
  tierTrackId: 'bovine_minigraph_tier',
  bubbleScoreTrackId: 'bovine_bubble_score',
  // Leonard et al. published one graph per autosome and no sex chromosome, so
  // the tier holds chr1-29 and nothing else.
  chromosomes: [
    { name: 'chr1', length: 158_534_110 },
    { name: 'chr2', length: 136_231_102 },
    { name: 'chr3', length: 121_005_158 },
    { name: 'chr4', length: 120_000_601 },
    { name: 'chr5', length: 120_089_316 },
    { name: 'chr6', length: 117_806_340 },
    { name: 'chr7', length: 110_682_743 },
    { name: 'chr8', length: 113_319_770 },
    { name: 'chr9', length: 105_454_467 },
    { name: 'chr10', length: 103_308_737 },
    { name: 'chr11', length: 106_982_474 },
    { name: 'chr12', length: 87_216_183 },
    { name: 'chr13', length: 83_472_345 },
    { name: 'chr14', length: 82_403_003 },
    { name: 'chr15', length: 85_007_780 },
    { name: 'chr16', length: 81_013_979 },
    { name: 'chr17', length: 73_167_244 },
    { name: 'chr18', length: 65_820_629 },
    { name: 'chr19', length: 63_449_741 },
    { name: 'chr20', length: 71_974_595 },
    { name: 'chr21', length: 69_862_954 },
    { name: 'chr22', length: 60_773_035 },
    { name: 'chr23', length: 52_498_615 },
    { name: 'chr24', length: 62_317_253 },
    { name: 'chr25', length: 42_350_435 },
    { name: 'chr26', length: 51_992_305 },
    { name: 'chr27', length: 45_612_108 },
    { name: 'chr28', length: 45_940_150 },
    { name: 'chr29', length: 51_098_607 },
  ],
}

const ARABIDOPSIS_CONFIG =
  'https://jbrowse.org/pangenome/arabidopsis-tair10/config.json'

export const ARABIDOPSIS_GRAPH_BROWSER: PangenomeGraphBrowser = {
  configUrl: ARABIDOPSIS_CONFIG,
  segmentsTrackId: 'arabidopsis_minigraph_segments',
  bubblesTrackId: 'arabidopsis_minigraph_bubbles',
  geneTrackId: 'GCF_000001735.4-ncbiRefSeqCurated',
  allelesTrackId: 'arabidopsis_minigraph_alleles',
  tierTrackId: 'arabidopsis_minigraph_tier',
  bubbleScoreTrackId: 'arabidopsis_bubble_score',
  rearrangementTrack: { trackId: 'arabidopsis_syri_regions', height: 644 },
  chromosomes: [
    { name: 'Chr1', length: 30_427_671 },
    { name: 'Chr2', length: 19_698_289 },
    { name: 'Chr3', length: 23_459_830 },
    { name: 'Chr4', length: 18_585_056 },
    { name: 'Chr5', length: 26_975_502 },
  ],
}

// Derived catalogues, not curated ones: `website/generatePangenomeLoci.ts`
// ranks each graph's coarse tier by segments per bubble and names the entries
// off the reference annotation, and its output is committed under
// `website/public/pangenome-<id>/loci.json`. Imported at build so the loci are
// a plain array here like HPRC's, and served at the same path so the generator
// has one output rather than two.
const MOUSE_LOCI = derivedLoci(mouseLociFile)
const BOVINE_LOCI = derivedLoci(bovineLociFile)
const ARABIDOPSIS_LOCI = derivedLoci(arabidopsisLociFile)

// The mouse strain graph: UCSC mm39 plus 18 Mouse Genomes Project strain
// assemblies, aligned here with `minigraph -cxggs` and projected onto GRCm39.
// Built in jbrowse-components (`scripts/build_mouse_pangenome.sh`) and hosted
// under `demos/mouse_pangenome/`; the tutorial is /docs/tutorials/
// pangenome_nonhuman on the JBrowse docs site.
//
// It has no `graphVcf` and never will without a rebuild. That is the one
// structural difference between the three datasets here, and it is worth being
// precise about: a line-type census of the finished 3.3 GB rGFA finds `H`, `S`
// and `L` and no `P` or `W` at all, so the graph does not record which strain
// walks which node. `firstSeenIn` in its allele file is construction order, not
// carriage. Recovering carriage means `minigraph --call` per assembly plus
// `mgutils.js merge`, or a minigraph-cactus rebuild — see
// agent-docs/PANGENOME_PORTAL.md.
export const MOUSE_DATASET: PangenomeDataset = {
  id: 'mouse',
  label: 'Mouse strain pangenome (minigraph, GRCm39)',
  reference: {
    assembly: 'mm39',
    configUrl: ucscConfigPath('mm39'),
    label: 'GRCm39',
    geneTrackId: 'mm39-ncbiRefSeq',
    taxonId: 10090,
  },
  panelDescription:
    'GRCm39 (C57BL/6J) plus 18 inbred and wild-derived Mouse Genomes Project strains',
  svTrackIds: [],
  graphBrowser: features.pangenomeGraph ? MOUSE_GRAPH_BROWSER : undefined,
  loci: MOUSE_LOCI,
  heading: 'Mouse strain pangenome',
  tutorialUrl: 'https://jbrowse.org/jb2/docs/tutorials/pangenome_mouse/',
  filePrefix: 'https://jbrowse.org/demos/mouse_pangenome/mouse-mm39-minigraph',
  // Measured 2026-09-09. No `.vcf.gz` row, because there is no callset.
  sizes: {
    '.rgfa.gz': 911_079_492,
    '.segs.bed.gz': 12_316_003,
    '.links.bed.gz': 54_683_427,
    '.bubbles.bed.gz': 173_746_998,
    '.alleles.bed.gz': 12_838_735,
    '.tier10000.segs.bed.gz': 184_056,
  },
  links: [
    {
      label: 'Mouse Genomes Project',
      url: 'https://projects.ensembl.org/mouse_genomes/',
    },
    { label: 'Strain assemblies', url: '/search/?q=Mus+musculus' },
    {
      label: 'How the graph was built',
      url: 'https://jbrowse.org/demos/mouse_pangenome/README.txt',
    },
  ],
}

// The bovine super-pangenome: 12 assemblies on ARS-UCD1.2, taurine and indicine
// breeds plus yak, bison and gaur, published by Leonard et al. 2023 (Zenodo
// 7737904, CC-BY 4.0) and projected here from their minigraph graphs.
//
// It DOES have a callset, and the route is worth knowing because it is the one
// mouse lacks: the published GFAs carry one `P` line per assembly, so
// `vg deconstruct` projects them onto the reference directly. Eleven haploid
// genotype columns, hence `phased` unset.
const BOVINE_ROWS = {
  domain: [
    'ANG',
    'BSW',
    'HIG',
    'OBV',
    'PIE',
    'SIM',
    'BRA',
    'NEL',
    'GAU',
    'BIS',
    'YAK',
  ],
  labels: {
    ANG: 'Angus',
    BSW: 'Brown Swiss',
    HIG: 'Highland',
    OBV: 'Original Braunvieh',
    PIE: 'Piedmontese',
    SIM: 'Simmental',
    BRA: 'Brahman',
    NEL: 'Nellore',
    GAU: 'Gaur',
    BIS: 'Bison',
    YAK: 'Yak',
  },
}

const BOVINE_ROW_COLOR = {
  field: 'lineage',
  domain: ['taurine', 'indicine', 'gaur', 'bison', 'yak'],
  range: ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#D55E00'],
}

export const BOVINE_DATASET: PangenomeDataset = {
  id: 'bovine',
  label: 'Bovine super-pangenome (minigraph, ARS-UCD1.2)',
  reference: {
    assembly: 'bosTau9',
    configUrl: ucscConfigPath('bosTau9'),
    label: 'ARS-UCD1.2',
    geneTrackId: 'bosTau9-ncbiRefSeq',
    taxonId: 9913,
  },
  panelDescription:
    'ARS-UCD1.2 (Hereford) plus eight taurine and indicine breeds, yak, bison and gaur',
  graphVcf: {
    trackId: 'bovine-arsucd12-minigraph-vcf',
    name: 'Bovine super-pangenome variants (minigraph, ARS-UCD1.2)',
    url: 'https://jbrowse.org/demos/bovine_pangenome/bovine-arsucd12-minigraph.vcf.gz',
    samplesTsvUrl:
      'https://jbrowse.org/demos/bovine_pangenome/bovine-arsucd12-minigraph.samples.tsv',
    rows: BOVINE_ROWS,
    rowColor: BOVINE_ROW_COLOR,
  },
  svTrackIds: [],
  graphBrowser: features.pangenomeGraph ? BOVINE_GRAPH_BROWSER : undefined,
  loci: BOVINE_LOCI,
  heading: 'Bovine super-pangenome',
  tutorialUrl: 'https://jbrowse.org/jb2/docs/tutorials/pangenome_cattle/',
  filePrefix:
    'https://jbrowse.org/demos/bovine_pangenome/bovine-arsucd12-minigraph',
  // Measured 2026-09-09.
  sizes: {
    '.rgfa.gz': 759_848_507,
    '.segs.bed.gz': 4_069_833,
    '.links.bed.gz': 17_296_108,
    '.bubbles.bed.gz': 50_466_192,
    '.alleles.bed.gz': 4_265_145,
    '.tier10000.segs.bed.gz': 47_919,
    '.vcf.gz': 88_349_570,
  },
  links: [
    {
      label: 'Leonard et al. 2023',
      url: 'https://doi.org/10.1186/s13059-023-02969-y',
    },
    { label: 'Source graphs', url: 'https://doi.org/10.5281/zenodo.7737904' },
    {
      label: 'How the projections were built',
      url: 'https://jbrowse.org/demos/bovine_pangenome/README.txt',
    },
  ],
}

// 26 1001 Genomes Plus Phase 1 accessions and TAIR10, aligned with
// `minigraph -cxggs` in jbrowse-components
// (`scripts/build_arabidopsis_pangenome.sh`) and hosted under
// `demos/arabidopsis_pangenome/`. No callset, for mouse's reason.
export const ARABIDOPSIS_DATASET: PangenomeDataset = {
  id: 'arabidopsis',
  label: '1001 Genomes Plus pangenome (minigraph, TAIR10)',
  reference: {
    assembly: 'GCF_000001735.4',
    configUrl: genarkConfigPath('GCF_000001735.4'),
    label: 'TAIR10.1',
    geneTrackId: 'GCF_000001735.4-ncbiRefSeqCurated',
    taxonId: 3702,
  },
  panelDescription:
    'TAIR10 (Col-0) plus 26 1001 Genomes Plus Phase 1 accessions',
  svTrackIds: [],
  graphBrowser: features.pangenomeGraph ? ARABIDOPSIS_GRAPH_BROWSER : undefined,
  loci: ARABIDOPSIS_LOCI,
  heading: 'Arabidopsis 1001 Genomes Plus pangenome',
  tutorialUrl: 'https://jbrowse.org/jb2/docs/tutorials/syri_synteny/',
  filePrefix:
    'https://jbrowse.org/demos/arabidopsis_pangenome/arabidopsis-tair10-minigraph',
  // Measured 2026-09-25. No `.vcf.gz` row, because there is no callset.
  sizes: {
    '.rgfa.gz': 65_317_227,
    '.segs.bed.gz': 1_719_822,
    '.links.bed.gz': 7_909_977,
    '.bubbles.bed.gz': 27_400_980,
    '.alleles.bed.gz': 1_668_634,
    '.tier10000.segs.bed.gz': 49_228,
  },
  links: [
    { label: '1001 Genomes', url: 'https://1001genomes.org/' },
    {
      label: 'Igolkina et al. 2025',
      url: 'https://doi.org/10.1038/s41588-025-02293-0',
    },
    {
      label: 'How the graph was built',
      url: 'https://jbrowse.org/demos/arabidopsis_pangenome/README.txt',
    },
    {
      label: 'Every accession as SyRI lanes',
      url: 'https://jbrowse.org/code/jb2/main/?config=https%3A%2F%2Fjbrowse.org%2Fdemos%2Farabidopsis_pangenome%2Fconfig.json',
    },
  ],
}

// Every dataset, keyed by `id`.
export const PANGENOME_DATASETS: readonly PangenomeDataset[] = [
  HPRC_DATASET,
  MOUSE_DATASET,
  BOVINE_DATASET,
  ARABIDOPSIS_DATASET,
]
