// JBrowse launch-URL builders for the pangenome explorer. Session specs can only
// reference trackIds that exist in the merged/served config (a track config can't
// be inlined), so these reference the HPRC VCF tracks added via
// ucsc2jbrowse/ucscExtensions/{hg38,hs1}.json and the existing hg38↔CHM13 liftOver
// synteny track. Coordinates are GRCh38/hg38 (the catalog's reference).

import { mergeConfig, specUrl } from './jbrowseLinks.ts'
import { locusRegion, syntenyGene } from './pangenomeLoci.ts'

import type { PangenomeLocus } from './pangenomeLoci.ts'

const HG38_CONFIG = 'https://jbrowse.org/ucsc/hg38/config.json'

// CHM13 as served via GenArk (the assembly the hg38↔CHM13 synteny track targets).
const CHM13_ACCESSION = 'GCA_009914755.4'
const HG38_CHM13_SYNTENY_TRACK = 'hg38_to_GCA_009914755.4_liftOver'

// GRCh38 LinearGenomeView with the HPRC pangenome VCF + RefSeq open at `loc`.
function hg38VcfLgvUrl(loc: string) {
  return specUrl(HG38_CONFIG, [
    {
      type: 'LinearGenomeView',
      assembly: 'hg38',
      loc,
      tracks: ['hg38-ncbiRefSeq', 'hg38-hprc-v1.1-pangenome-vcf'],
    },
  ])
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
