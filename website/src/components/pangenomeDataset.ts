// Everything that ties the pages to one pangenome graph and its reference. A
// new graph is another PangenomeDataset; the components and link builders read
// only this shape.

import { genarkConfigPath, ucscConfigPath } from '../config/jbrowse.ts'
import {
  ARABIDOPSIS_KNOWN_ALLELES,
  ARABIDOPSIS_PANGENOME_LOCI,
} from './pangenomeArabidopsisLoci.ts'
import {
  BOVINE_KNOWN_ALLELES,
  BOVINE_PANGENOME_LOCI,
} from './pangenomeBovineLoci.ts'
import { GWAS_CATALOG, OMIA_CATTLE } from './pangenomeCatalogs.ts'
import { HUMAN_KNOWN_ALLELES, PANGENOME_LOCI } from './pangenomeLoci.ts'
import {
  MOUSE_KNOWN_ALLELES,
  MOUSE_PANGENOME_LOCI,
} from './pangenomeMouseLoci.ts'

import type { CatalogTrack } from './pangenomeCatalogs.ts'
import type { KnownAllele } from './pangenomeKnownAlleles.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

interface PangenomeReference {
  assembly: string
  // A hosted JBrowse config that already defines `assembly` and its gene track.
  configUrl: string
  label: string
  geneTrackId: string
  // NCBI taxonomy id of the reference species, which the region box's gene
  // lookup asks mygene.info for.
  taxonId: number
  // The reference's gene track as CSI-indexed GFF3 (`gene` lines, `NM_`/`XM_`
  // transcripts); the map's gene row reads spans from it, else from
  // mygene.info.
  geneGffUrl?: string
}

interface PangenomeGraphVcf {
  trackId: string
  name: string
  // CORS-open, tabix-indexed VCF (a co-located .tbi lets JBrowse stream it).
  url: string
  // Split each sample into haplotype rows. True only for genuinely phased
  // genotypes (HPRC); a haploid-per-assembly `vg deconstruct` callset draws
  // every second row empty if phased.
  phased?: boolean
  // A `name`-keyed sample table beside the VCF, whose columns `rowColor` can
  // color rows by.
  samplesTsvUrl?: string
  // Bytes the adapter may fetch for one view, over VcfTabixAdapter's 5 MB.
  fetchSizeLimit?: number
  rows?: { sort: string[]; labels: Record<string, string> }
  rowColor?: { field: string; scale: { domain: string[]; range: string[] } }
}

// The hosted config that draws the graph. Separate from `reference.configUrl`:
// only it declares the graph plugin, so a dead plugin url costs these launches
// alone.
export interface PangenomeGraphBrowser {
  configUrl: string
  // rGFA segments track, which a graph launch opens as the graph
  segmentsTrackId: string
  bubblesTrackId: string
  geneTrackId: string
  // One node per top-level bubble, which draws a whole chromosome in a few
  // hundred nodes.
  tierTrackId: string
  // Segments per bubble, drawn beside the tier.
  bubbleScoreTrackId: string
  // The sequences the graph holds, with their lengths.
  chromosomes: { name: string; length: number }[]
  // One lane per haplotype walk, each in its own contig's coordinates, read
  // from the walk file at query time.
  haplotypeLanesTrackId?: string
  // Optional rearrangements called between assemblies, opened under the lanes
  // (the Arabidopsis chromosome 4 inversion has no bubble; SyRI's rows show
  // it).
  rearrangementTrack?: { trackId: string; height: number }
}

interface PangenomePublishedFile {
  suffix: string
  what: string
  bytes: number
}

// The files a graph in this stack can publish, in table order: the graph, the
// projections (`gfa-to-tabix`, `build_rgfa_alleles.sh`, `build_bubble_tier.sh`)
// and the callset.
const GRAPH_FILE_KINDS: { suffix: string; what: string }[] = [
  { suffix: '.rgfa.gz', what: 'the graph itself' },
  {
    suffix: '.anchored.graph.bed.gz',
    what: 'one row per node and per link, filed under the reference interval its bubble hangs from',
  },
  {
    suffix: '.graph.bed.gz',
    what: 'one row per node and per link, under its own coordinate',
  },
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

export function publishedFiles(
  dataset: PangenomeDataset,
): PangenomePublishedFile[] {
  return GRAPH_FILE_KINDS.flatMap(kind => {
    const bytes = dataset.sizes[kind.suffix]
    return bytes === undefined ? [] : [{ ...kind, bytes }]
  })
}

export interface PangenomeDataset {
  id: string
  heading: string
  reference: PangenomeReference
  // The assemblies the graph adds to its reference: a noun phrase with no
  // terminal punctuation or em-dash and without the reference, since callers
  // end the sentence on `reference.label`.
  panelDescription: string
  // The reference-projected callset, where the graph has one. Absent for a
  // graph that records no haplotype paths (`minigraph -cxggs`), so it cannot
  // say which strain carries an allele.
  graphVcf?: PangenomeGraphVcf
  // Structural-variation tracks in `reference.configUrl` to open with the
  // graph.
  svTrackIds?: string[]
  graphBrowser: PangenomeGraphBrowser
  // The graph's haplotype walks on the reference (`gfa-to-tabix --walks`,
  // `.tbi` beside it), which the focused row's graph and the BandageJS link cut
  // from. Only a graph with haplotype paths has one.
  walksUrl?: string
  loci: PangenomeLocus[]
  knownAlleles: KnownAllele[]
  catalogs?: CatalogTrack[]
  // The structural-state sidecar of this graph's callset, built by
  // `pangenome-config/build*SvStates.sh` under its format's version. The page
  // reads it for any region asked and groups the haplotypes there into
  // structural forms.
  svStatesUrl?: string
  // Haplotypes the lane track draws without gene models (those HPRC's CAT index
  // does not annotate; `generatePangenomeHaplotypes.ts` prints them), so a form
  // is not represented by one.
  haplotypesWithoutGenes?: string[]
  filePrefix: string
  // Bytes per suffix, stated so a static build needs no network. A suffix
  // absent here is absent from the table. `pnpm check-pangenome-assets` catches
  // a moved file; a grown one shows a stale size until re-measured.
  sizes: Record<string, number>
  links: { label: string; url: string }[]
}

// The config is ours: `website/pangenome-config/hprc-grch38.json`, published by
// `upload.sh` to the jbrowse.org bucket (our site sends no CORS headers).
// Upload before deploying. The plugin url is the unversioned entry point, not a
// content-hashed build: the plugin links an unreleased @jbrowse/render-core, so
// old bundles stop booting. Every launch goes to `main` (`JBROWSE_BASE`); no
// released host reads the plugin.
const minigraphTracks = (prefix: string) => ({
  segmentsTrackId: `${prefix}_minigraph_segments`,
  bubblesTrackId: `${prefix}_minigraph_bubbles`,
  tierTrackId: `${prefix}_minigraph_tier`,
  bubbleScoreTrackId: `${prefix}_bubble_score`,
})

export const HPRC_GRAPH_BROWSER: PangenomeGraphBrowser = {
  configUrl: 'https://jbrowse.org/pangenome/hprc-grch38/config.json',
  ...minigraphTracks('hprc'),
  geneTrackId: 'hg38_ncbiRefSeq_ucsc',
  haplotypeLanesTrackId: 'hprc_v2_1_walk_lanes',
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
  reference: {
    assembly: 'hg38',
    configUrl: ucscConfigPath('hg38'),
    label: 'GRCh38',
    geneTrackId: 'hg38-ncbiRefSeq',
    taxonId: 9606,
    geneGffUrl: 'https://jbrowse.org/ucsc/hg38/ncbiRefSeq.gff.gz',
  },
  panelDescription:
    '232 phased diploid assemblies from diverse human populations, 464 haplotypes',
  graphVcf: {
    trackId: 'hprc-v2.1-mc-grch38-pangenome-vcf',
    name: 'HPRC pangenome structural variants, normalized with vcfwave (minigraph-cactus v2.1, GRCh38)',
    // The release's normalized callset
    // (`pangenome-config/buildHprcSvCallset.sh`): one allele per record,
    // vcfwave-realigned so a deletion spans the bases it removes and an
    // insertion sits at one. pgbi.vcf.gz has whole bubble alleles that draw an
    // insertion as a block, and merged records color as "Other / mixed".
    url: 'https://jbrowse.org/pangenome/hprc-grch38/sv-callset/hprc-v2.1-mc-grch38.sv.v4.vcf.gz',
    phased: true,
    fetchSizeLimit: 20_000_000,
  },
  // Not `hg38-hprcInsertsV1`/`hg38-hprcDeletionsV1`: over an example window
  // they are mostly 1 bp records and push these two below a 900 px window.
  svTrackIds: ['hg38-hprcArrInvBedV1', 'hg38-hprcArrDupBedV1'],
  graphBrowser: HPRC_GRAPH_BROWSER,
  walksUrl:
    'https://jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38-f5s.GRCh38.walks.bed.gz',
  loci: PANGENOME_LOCI,
  knownAlleles: HUMAN_KNOWN_ALLELES,
  catalogs: [GWAS_CATALOG],
  svStatesUrl:
    'https://jbrowse.org/pangenome/hprc-grch38/sv-states/hprc-v2.1-mc-grch38.sv-states.v3.tsv.gz',
  haplotypesWithoutGenes: ['HG002#1', 'HG002#2'],
  heading: 'Human pangenome (HPRC release 2)',
  filePrefix: 'https://jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38',
  // Measured 2026-10-07 against v2.1, the graph file 2026-10-30. No `.rgfa.gz` or `.vcf.gz` row: the graph
  // is release 2's own `sv.gfa.gz` on S3 and the callset is the release's, at
  // its own url.
  sizes: {
    '.anchored.graph.bed.gz': 28_644_429,
    '.bubbles.bed.gz': 61_453_085,
    '.alleles.bed.gz': 5_213_294,
    '.tier10000.segs.bed.gz': 104_044,
  },
  links: [
    {
      label: 'Tutorial',
      url: 'https://jbrowse.org/jb2/docs/tutorials/pangenome_hprc/',
    },
    { label: 'HPRC', url: 'https://humanpangenome.org/' },
    {
      label: 'Release 2 files',
      url: 'https://github.com/human-pangenomics/hpp_pangenome_resources',
    },
    { label: 'Sample assemblies', url: '/hubs/HPRC/' },
    {
      label: 'How the projections were built',
      url: 'https://jbrowse.org/demos/hprc/README.txt',
    },
  ],
}

// Both non-human graphs are hosted and configured like HPRC's, so one component
// renders all three. Configs: `website/pangenome-config/mouse-mm39.json` and
// `bovine-arsucd12.json`, uploaded by `upload.sh` and checked by `pnpm
// check-pangenome-assets`. The adapters ship in the graphgenomeviewer plugin,
// so the linear lanes need it too.
const MOUSE_GRAPH_BROWSER: PangenomeGraphBrowser = {
  configUrl: 'https://jbrowse.org/pangenome/mouse-mm39/config.json',
  ...minigraphTracks('mouse'),
  geneTrackId: 'mm39_ncbiRefSeq_ucsc',
  // The 20 sequences the graph holds, from the tier file's refNames, not mm39's
  // chrom.sizes: no chrY or chrM is aligned, so launching one draws an empty
  // pane.
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
  ...minigraphTracks('bovine'),
  geneTrackId: 'bosTau9_ncbiRefSeq_ucsc',
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

export const ARABIDOPSIS_GRAPH_BROWSER: PangenomeGraphBrowser = {
  configUrl: 'https://jbrowse.org/pangenome/arabidopsis-tair10/config.json',
  ...minigraphTracks('arabidopsis'),
  geneTrackId: 'GCF_000001735.4-ncbiRefSeqCurated',
  rearrangementTrack: { trackId: 'arabidopsis_syri_regions', height: 644 },
  chromosomes: [
    { name: 'Chr1', length: 30_427_671 },
    { name: 'Chr2', length: 19_698_289 },
    { name: 'Chr3', length: 23_459_830 },
    { name: 'Chr4', length: 18_585_056 },
    { name: 'Chr5', length: 26_975_502 },
  ],
}

// The mouse strain graph: UCSC mm39 plus 18 Mouse Genomes Project strain
// assemblies, aligned with `minigraph -cxggs` and projected onto GRCm39. Built
// in jbrowse-components (`scripts/build_mouse_pangenome.sh`), hosted under
// `demos/mouse_pangenome/`. The graph has no `P` or `W` lines, so
// `buildMouseSvStates.sh` maps each strain back with `minigraph --call`. No
// `graphVcf`: that VCF is not published.
export const MOUSE_DATASET: PangenomeDataset = {
  id: 'mouse',
  reference: {
    assembly: 'mm39',
    configUrl: ucscConfigPath('mm39'),
    label: 'GRCm39',
    geneTrackId: 'mm39-ncbiRefSeq',
    taxonId: 10090,
  },
  panelDescription: '18 inbred and wild-derived Mouse Genomes Project strains',
  graphBrowser: MOUSE_GRAPH_BROWSER,
  loci: MOUSE_PANGENOME_LOCI,
  knownAlleles: MOUSE_KNOWN_ALLELES,
  svStatesUrl:
    'https://jbrowse.org/pangenome/mouse-mm39/sv-states/mouse-mm39-minigraph.sv-states.v2.tsv.gz',
  heading: 'Mouse strain pangenome',
  filePrefix: 'https://jbrowse.org/demos/mouse_pangenome/mouse-mm39-minigraph',
  // Measured 2026-09-09, the graph file 2026-10-30. No `.vcf.gz` row: no callset.
  sizes: {
    '.rgfa.gz': 911_079_492,
    '.graph.bed.gz': 62_213_868,
    '.bubbles.bed.gz': 173_746_998,
    '.alleles.bed.gz': 12_838_735,
    '.tier10000.segs.bed.gz': 184_056,
  },
  links: [
    {
      label: 'Tutorial',
      url: 'https://jbrowse.org/jb2/docs/tutorials/pangenome_mouse/',
    },
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

// The bovine super-pangenome: 12 assemblies on ARS-UCD1.2 (Leonard et al. 2023,
// Zenodo 7737904, CC-BY 4.0), projected from their minigraph graphs. The GFAs
// carry one `P` line per assembly, so `vg deconstruct` gives a callset; eleven
// haploid columns, so `phased` is unset. No lane track or walk file, so a
// focused row opens no lanes.
const BOVINE_ROWS = {
  sort: [
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
  scale: {
    domain: ['taurine', 'indicine', 'gaur', 'bison', 'yak'],
    range: ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#D55E00'],
  },
}

export const BOVINE_DATASET: PangenomeDataset = {
  id: 'bovine',
  reference: {
    assembly: 'bosTau9',
    configUrl: ucscConfigPath('bosTau9'),
    label: 'ARS-UCD1.2',
    geneTrackId: 'bosTau9-ncbiRefSeq',
    taxonId: 9913,
  },
  panelDescription:
    'Eight taurine and indicine cattle breeds, yak, bison and gaur',
  graphVcf: {
    trackId: 'bovine-arsucd12-minigraph-vcf',
    name: 'Bovine super-pangenome variants (minigraph, ARS-UCD1.2)',
    url: 'https://jbrowse.org/demos/bovine_pangenome/bovine-arsucd12-minigraph.vcf.gz',
    samplesTsvUrl:
      'https://jbrowse.org/demos/bovine_pangenome/bovine-arsucd12-minigraph.samples.tsv',
    rows: BOVINE_ROWS,
    rowColor: BOVINE_ROW_COLOR,
  },
  graphBrowser: BOVINE_GRAPH_BROWSER,
  loci: BOVINE_PANGENOME_LOCI,
  knownAlleles: BOVINE_KNOWN_ALLELES,
  catalogs: [OMIA_CATTLE],
  svStatesUrl:
    'https://jbrowse.org/pangenome/bovine-arsucd12/sv-states/bovine-arsucd12-minigraph.sv-states.v2.tsv.gz',
  heading: 'Bovine super-pangenome',
  filePrefix:
    'https://jbrowse.org/demos/bovine_pangenome/bovine-arsucd12-minigraph',
  sizes: {
    '.rgfa.gz': 759_848_507,
    '.graph.bed.gz': 19_779_752,
    '.bubbles.bed.gz': 50_466_192,
    '.alleles.bed.gz': 4_265_145,
    '.tier10000.segs.bed.gz': 47_919,
    '.vcf.gz': 88_349_570,
  },
  links: [
    {
      label: 'Tutorial',
      url: 'https://jbrowse.org/jb2/docs/tutorials/pangenome_cattle/',
    },
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

// 26 1001 Genomes Plus Phase 1 accessions and TAIR10, aligned with `minigraph
// -cxggs` (`scripts/build_arabidopsis_pangenome.sh`), hosted under
// `demos/arabidopsis_pangenome/`. The graph has no paths, so
// `buildArabidopsisSvStates.sh` maps each accession back with `minigraph
// --call`. No `graphVcf`: that VCF is not published.
export const ARABIDOPSIS_DATASET: PangenomeDataset = {
  id: 'arabidopsis',
  reference: {
    assembly: 'GCF_000001735.4',
    configUrl: genarkConfigPath('GCF_000001735.4'),
    label: 'TAIR10.1',
    geneTrackId: 'GCF_000001735.4-ncbiRefSeqCurated',
    taxonId: 3702,
  },
  panelDescription: '26 1001 Genomes Plus Phase 1 accessions',
  graphBrowser: ARABIDOPSIS_GRAPH_BROWSER,
  loci: ARABIDOPSIS_PANGENOME_LOCI,
  knownAlleles: ARABIDOPSIS_KNOWN_ALLELES,
  svStatesUrl:
    'https://jbrowse.org/pangenome/arabidopsis-tair10/sv-states/arabidopsis-tair10-minigraph.sv-states.v2.tsv.gz',
  heading: 'Arabidopsis 1001 Genomes Plus pangenome',
  filePrefix:
    'https://jbrowse.org/demos/arabidopsis_pangenome/arabidopsis-tair10-minigraph',
  // Measured 2026-09-25, the graph file 2026-10-30. No `.vcf.gz` row: no callset.
  sizes: {
    '.rgfa.gz': 65_317_227,
    '.graph.bed.gz': 9_282_813,
    '.bubbles.bed.gz': 27_400_980,
    '.alleles.bed.gz': 1_668_634,
    '.tier10000.segs.bed.gz': 49_228,
  },
  links: [
    {
      label: 'Tutorial',
      url: 'https://jbrowse.org/jb2/docs/tutorials/syri_synteny/',
    },
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

// Every dataset, in the order /pangenomes lists them.
export const PANGENOME_DATASETS: readonly PangenomeDataset[] = [
  HPRC_DATASET,
  MOUSE_DATASET,
  BOVINE_DATASET,
  ARABIDOPSIS_DATASET,
]
