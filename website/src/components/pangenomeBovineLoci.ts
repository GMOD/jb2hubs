// Curated examples on /pangenomes/bovine, on ARS-UCD1.2 (bosTau9), 0-based
// half-open. Each window was measured against the published bubble, allele and
// tier files and the callset on 2026-10-08, and no bubble crosses either edge.
// The numbers and the alternates are in
// agent-docs/reference/PANGENOME_PAGES.md.
//
// Measured and declined:
// - KIT gene body (chr6:70,166,692-70,254,049): no allele of 1 kb or more. The
//   colour-sided allele is a chr6-to-chr29 translocation, which a
//   per-chromosome graph cannot hold.
// - POLLED, the 80 kb duplication at chr1:2.6 Mb: chr1:2,380,000-2,480,000
//   holds seven SVs, none over 407 bp, and the panel has no Holstein.
// - WC1 / CD163L1 (chr5:102.0-103.0 Mb): a 245-segment, 184 kb bubble at
//   102,828,111, with no published difference to describe it by.

import type { PangenomeLocus } from './pangenomeLoci.ts'

export const BOVINE_PANGENOME_LOCI: PangenomeLocus[] = [
  {
    id: 'kit',
    gene: 'KIT',
    fullName: 'KIT upstream repeat',
    // The bubble at 70,099,508-70,120,129, 47 kb 5' of KIT, where ten
    // assemblies delete 20.6 kb, and the gene's first 33 kb. KIT itself is
    // flat.
    chrom: 'chr6',
    start: 70_085_000,
    end: 70_200_000,
  },
  {
    id: 'polled',
    gene: 'POLLED',
    fullName: 'Polled (hornless) locus',
    // One record at chr1:2,429,329, 7 bp replaced by 209 bp. The window is
    // narrow so a 202 bp event is not lost.
    chrom: 'chr1',
    start: 2_400_000,
    end: 2_460_000,
  },
  {
    id: 'asip',
    gene: 'ASIP',
    fullName: 'Agouti signalling protein',
    // An 8.4 kb deletion at 63,639,812-63,648,215, in the gene's 5' end.
    chrom: 'chr13',
    start: 63_600_000,
    end: 63_700_000,
  },
  {
    id: 'bola-dq',
    gene: 'BoLA-DQ',
    fullName: 'MHC class II, DQ region',
    // DQA2 through the bubbles 5' of DRB3: a 70.2 kb site with five alternate
    // alleles of 3.8 to 55.7 kb. DRB3 (25,723,690-25,734,819) is outside,
    // because including it takes the window to 158 kb.
    chrom: 'chr23',
    start: 25_570_000,
    end: 25_715_000,
  },
  {
    id: 'cathl',
    gene: 'CATHL',
    fullName: 'Cathelicidin cluster',
    // Insertions of 4.1 to 13.4 kb between CATHL1 and CATHL4.
    chrom: 'chr22',
    start: 51_560_000,
    end: 51_650_000,
  },
  {
    id: 'bola-i',
    gene: 'BoLA class I',
    fullName: 'MHC class I',
    // One 60.8 kb bubble of 148 segments.
    chrom: 'chr23',
    start: 28_605_000,
    end: 28_750_000,
  },
  {
    id: 'defb',
    gene: 'DEFB',
    fullName: 'Beta-defensin cluster',
    // One bubble of 1,113 segments, chr27:6,345,695-7,202,077. A 150 kb cut
    // would start and end inside it, so the window is the bubble and draws
    // from the coarse tier.
    chrom: 'chr27',
    start: 6_341_000,
    end: 7_210_000,
  },
]
