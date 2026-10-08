// Curated examples on /pangenomes/mouse, on GRCm39 (mm39), 0-based half-open.
// Each window was measured against the published bubble, allele and tier files
// on 2026-10-08, and no bubble crosses either edge. The numbers and the
// alternates are in agent-docs/reference/PANGENOME_PAGES.md.
//
// Measured and declined:
// - Mup central array (chr4:60,720,000-61,300,000): 580 kb holds 14 bubbles and
//   no coarse-tier bubble, because minigraph puts a near-identical tandem array
//   on one path.
// - Skint1 to Skint9 (chr4:111,850,000-112,300,000): 14 bubbles, largest allele
//   6.5 kb, no tier bubble.
// - Glo1 (chr17:30,700,000-31,300,000): 126 bubbles, none over 6.4 kb. The
//   475 kb duplication is not in the graph.
// - H2-Ea (chr17:34,500,500-34,620,000): one 630 bp insertion in 120 kb.

import type { PangenomeLocus } from './pangenomeLoci.ts'

export const MOUSE_PANGENOME_LOCI: PangenomeLocus[] = [
  {
    id: 'nlrp1',
    gene: 'Nlrp1',
    fullName: 'NLRP1 inflammasome paralogs',
    // Starts before the bubble at 70,970,673 and ends after the 86-segment one
    // at 71,091,857-71,119,017, whose longest path is 169.7 kb. 13 kb of Nlrp1b
    // and all of Nlrp1c-ps are outside: the next bubble
    // (71,122,331-71,130,898) would put the window over 150 kb.
    chrom: 'chr11',
    start: 70_970_500,
    end: 71_120_500,
  },
  {
    id: 'ly49',
    gene: 'Ly49 (Klra)',
    fullName: 'NK cell receptor cluster',
    // Klra8 (Ly49h) through Klra9: the two bubbles at 130,066,306-130,098,956
    // and 130,102,193-130,165,773, the second a 63.6 kb deletion path. The
    // whole cluster runs past 700 kb.
    chrom: 'chr6',
    start: 130_060_000,
    end: 130_175_000,
  },
  {
    id: 'h2-d',
    gene: 'H2-D',
    fullName: 'MHC class I, D and Q regions',
    // H2-D1 through H2-Q4: a 73.5 kb insertion at 35,513,788 and a 231-segment
    // Q bubble. Ends before the 173 kb bubble that starts at 35,602,362.
    chrom: 'chr17',
    start: 35_470_000,
    end: 35_601_000,
  },
  {
    id: 'nnt',
    gene: 'Nnt',
    fullName: 'Nicotinamide nucleotide transhydrogenase',
    // One 16.5 kb insertion at 119,511,984, inside the gene.
    chrom: 'chr13',
    start: 119_460_000,
    end: 119_560_000,
  },
  {
    id: 'mx1',
    gene: 'Mx1',
    fullName: 'Myxovirus resistance 1',
    // One 3.4 kb insertion at 97,253,670, inside the gene.
    chrom: 'chr16',
    start: 97_230_000,
    end: 97_280_000,
  },
  {
    id: 'dilute',
    gene: 'Myo5a',
    fullName: 'Myosin Va, the dilute coat colour locus',
    // The 3' 60 kb of Myo5a, around the 8.7 kb insertion at 75,097,804. The
    // gene is 156 kb and its 5' end holds an unrelated 18 kb insertion.
    chrom: 'chr9',
    start: 75_065_000,
    end: 75_125_000,
  },
  {
    id: 'nonagouti',
    gene: 'Agouti (a)',
    fullName: 'Nonagouti coat colour locus',
    // A 14.7 kb deletion at 154,856,868-154,871,573, in intron 1.
    chrom: 'chr2',
    start: 154_800_000,
    end: 154_900_000,
  },
]
