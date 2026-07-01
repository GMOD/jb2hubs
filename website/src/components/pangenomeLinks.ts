// JBrowse launch-URL builders for the pangenome explorer. The HPRC VCF track isn't
// in the served hg38 config, so we attach it inline via `sessionTracks` (see
// specUrl) pointing straight at the public, CORS-enabled HPRC S3 VCF — the launch
// works without first baking the track into the config. The hg38↔CHM13 liftOver
// synteny track already exists in the merged config. Coordinates are GRCh38/hg38.

import { mergeConfig, specUrl } from './jbrowseLinks.ts'
import { locusRegion, syntenyGene } from './pangenomeLoci.ts'

import type { PangenomeLocus } from './pangenomeLoci.ts'

const HG38_CONFIG = 'https://jbrowse.org/ucsc/hg38/config.json'

// CHM13 as served via GenArk (the assembly the hg38↔CHM13 synteny track targets).
const CHM13_ACCESSION = 'GCA_009914755.4'
const HG38_CHM13_SYNTENY_TRACK = 'hg38_to_GCA_009914755.4_liftOver'

// The HPRC minigraph-cactus v1.1 GRCh38 VCF (vcfbub a100k + vcfwave), inlined as a
// session track. Public S3, CORS-open, with a co-located .tbi — JBrowse streams it.
const HPRC_VCF_TRACK_ID = 'hprc-v1.1-mc-grch38-pangenome-vcf'
const HPRC_VCF_TRACK = {
  type: 'VariantTrack',
  trackId: HPRC_VCF_TRACK_ID,
  name: 'HPRC pangenome variants (minigraph-cactus v1.1, GRCh38)',
  assemblyNames: ['hg38'],
  adapter: {
    type: 'VcfTabixAdapter',
    uri: 'https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/freeze1/minigraph-cactus/hprc-v1.1-mc-grch38/hprc-v1.1-mc-grch38.vcfbub.a100k.wave.vcf.gz',
  },
}

// UCSC's HPRC structural-variation BigBed tracks, already in the served hg38 config
// (genome-wide, CORS-fine on hgdownload). These ARE the headline SV story —
// insertions, deletions, inversions and duplications discovered across the HPRC
// assemblies — so the launch opens a structural-variation view, not just SNVs.
const HPRC_SV_TRACK_IDS = [
  'hg38-hprcInsertsV1',
  'hg38-hprcDeletionsV1',
  'hg38-hprcArrInvBedV1',
  'hg38-hprcArrDupBedV1',
]

// GRCh38 LinearGenomeView open at `loc`: RefSeq genes, the HPRC pangenome VCF
// (inlined from S3), and the HPRC structural-variation tracks.
function hg38VcfLgvUrl(loc: string) {
  return specUrl(
    HG38_CONFIG,
    [
      {
        type: 'LinearGenomeView',
        assembly: 'hg38',
        loc,
        tracks: ['hg38-ncbiRefSeq', HPRC_VCF_TRACK_ID, ...HPRC_SV_TRACK_IDS],
      },
    ],
    [HPRC_VCF_TRACK],
  )
}

// Whole-pangenome entry point: lands on the MHC (chr6) — the most-studied
// divergent locus — as a sensible starting view.
export function hprcBrowserUrl() {
  return hg38VcfLgvUrl('chr6:29,700,000-33,500,000')
}

// The HPRC pangenome VCF open at a specific catalog locus.
export function hprcVcfLgvUrl(locus: PangenomeLocus) {
  return hg38VcfLgvUrl(locusRegion(locus))
}

// Internal cross-link into the conserved-gene-order view for the locus's marker
// gene (not a JBrowse spec — a site route).
export function syntenyMultiUrl(locus: PangenomeLocus) {
  return `/conserved-gene-order?gene=${encodeURIComponent(syntenyGene(locus))}&ref=9606`
}

// Pairwise GRCh38 ↔ CHM13 synteny at the locus, showing reference-level divergence.
export function hprcSyntenyUrl(locus: PangenomeLocus) {
  return specUrl(mergeConfig(['hg38', CHM13_ACCESSION]), [
    {
      type: 'LinearSyntenyView',
      tracks: [HG38_CHM13_SYNTENY_TRACK],
      views: [
        { assembly: 'hg38', loc: locusRegion(locus) },
        { assembly: CHM13_ACCESSION },
      ],
      colorBy: 'query',
      drawCurves: true,
      autoDiagonalize: true,
    },
  ])
}
