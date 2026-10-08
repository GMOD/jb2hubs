// Curated examples on /pangenomes/arabidopsis, on TAIR10, 0-based half-open.
// Each window was measured against the published bubble, allele and tier files
// and the SyRI rows on 2026-10-08, and no bubble crosses either edge. The
// numbers and the alternates are in agent-docs/reference/PANGENOME_PAGES.md.
//
// Measured and declined:
// - FRI (Chr4:266,000-274,000): its known lesions are a 16 bp deletion, under
//   minigraph's size floor, and one in an accession outside the 26.
// - RPP8 (Chr5:17,450,000-17,480,000): 36 SVs, with bubbles crossing both edges
//   of the window.
// - RPP7 (Chr1:21,680,000-21,780,000): a 257-segment bubble runs
//   21,738,364-21,841,126, so the cluster needs over 150 kb.

import type { PangenomeLocus } from './pangenomeLoci.ts'

export const ARABIDOPSIS_PANGENOME_LOCI: PangenomeLocus[] = [
  {
    id: 'rpp5',
    gene: 'RPP5',
    fullName: 'RPP5 resistance gene cluster',
    // RPP4, SNC1, RPP5: one 70 kb bubble of 1,164 segments
    // (Chr4:9,481,498-9,551,536) whose longest path is 385 kb, and RLM3 beside
    // it.
    chrom: 'Chr4',
    start: 9_475_000,
    end: 9_570_000,
  },
  {
    id: 'rpp1',
    gene: 'RPP1',
    fullName: 'RPP1 resistance gene cluster',
    // RPP1 through the last paralog, AT3G44670: a 192-segment bubble and a
    // 1,323-segment one at 16,192,931. The first paralog, AT3G44400, is in a
    // separate bubble at 16,038,577 that would take the window to 192 kb.
    chrom: 'Chr3',
    start: 16_080_000,
    end: 16_230_000,
  },
  {
    id: 'rpm1',
    gene: 'RPM1',
    fullName: 'Resistance to P. syringae pv. maculicola 1',
    // A 3.7 kb deletion at 2,225,720-2,229,594 that removes RPM1
    // (2,225,855-2,229,555) and nothing else.
    chrom: 'Chr3',
    start: 2_205_000,
    end: 2_250_000,
  },
  {
    id: 's-locus',
    gene: 'S-locus',
    fullName: 'Self-incompatibility locus (SRK / SCR)',
    // One 32.7 kb bubble of 116 segments between PUB8 and ARK3.
    chrom: 'Chr4',
    start: 11_340_000,
    end: 11_405_000,
  },
  {
    id: 'flc',
    gene: 'FLC',
    fullName: 'Flowering Locus C',
    // Four alleles of 1.2 to 4.8 kb in intron 1. The window's 12.9 kb
    // insertion is 13 kb outside the gene.
    chrom: 'Chr5',
    start: 3_165_000,
    end: 3_195_000,
  },
  {
    id: 'mam',
    gene: 'MAM1 / MAM3',
    fullName: 'Methylthioalkylmalate synthase locus',
    // A 41-segment bubble inside MAM1 and a 6.7 kb deletion between MAM1 and
    // MAM3.
    chrom: 'Chr5',
    start: 7_690_000,
    end: 7_735_000,
  },
  {
    id: 'knob',
    gene: 'Chr4 knob',
    fullName: 'Chromosome 4 knob inversion',
    // SyRI's widest call (Chr4:1,612,605-2,782,621) with flank, cut between
    // bubbles. At 1.28 Mb the window draws from the coarse tier, and the
    // inversion shows in the SyRI rows: the graph has no bubble for it.
    chrom: 'Chr4',
    start: 1_558_000,
    end: 2_839_000,
  },
]
