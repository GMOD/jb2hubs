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

import type { KnownAllele } from './pangenomeKnownAlleles.ts'
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
    fullName: 'Myosin Va, the dilute coat color locus',
    // The 3' 60 kb of Myo5a, around the 8.7 kb insertion at 75,097,804. The
    // gene is 156 kb and its 5' end holds an unrelated 18 kb insertion.
    chrom: 'chr9',
    start: 75_065_000,
    end: 75_125_000,
  },
  {
    id: 'nonagouti',
    gene: 'Agouti (a)',
    fullName: 'Nonagouti coat color locus',
    // A 14.7 kb deletion at 154,856,868-154,871,573, in intron 1.
    chrom: 'chr2',
    start: 154_800_000,
    end: 154_900_000,
  },
]

// Carriers read off the sidecar on 2026-10-23. GRCm39 is C57BL/6J, and the
// panel holds a second, T2T assembly of it.
export const MOUSE_KNOWN_ALLELES: KnownAllele[] = [
  {
    id: 'nnt-b6j',
    name: 'Nnt deletion of C57BL/6J',
    chrom: 'chr13',
    start: 119_511_983,
    end: 119_511_997,
    about:
      "C57BL/6J carries a multi-exon deletion in Nnt, the mitochondrial transhydrogenase, and expresses it at a fraction of other strains' level; the strain's impaired glucose tolerance maps to a locus holding the gene. GRCm39 is C57BL/6J, so a strain drawn with an insertion here keeps the exons.",
    inPanel: 'Every strain but C57BL/6J keeps the exons, C57BL/6NJ among them',
    drawn: [{ gain: true, bp: 16_500, label: 'intact Nnt' }],
    citations: [
      {
        label: 'Toye et al. 2005, Diabetologia',
        url: 'https://doi.org/10.1007/s00125-005-1680-z',
      },
    ],
  },
  {
    id: 'mx1-lab',
    name: 'Mx1 exon 9–11 deletion',
    chrom: 'chr16',
    start: 97_253_669,
    end: 97_253_670,
    about:
      "Most classical inbred strains lost Mx1's exons 9 to 11, and with them the Mx protein that protects against influenza. C57BL/6J is one of them: the insertion here sits in the gap of its Mx1 where those exons would be. CBA/J keeps the exons, but a stop codon in them leaves it as susceptible.",
    inPanel:
      'Wild-derived CAST/EiJ, WSB/EiJ, PWK/PhJ and JF1/MsJ keep the exons, and so do NZO/HlLtJ and CBA/J',
    drawn: [{ gain: true, bp: 3400, label: 'Mx1 exons 9–11' }],
    citations: [
      {
        label: 'Staeheli et al. 1988, Mol Cell Biol',
        url: 'https://doi.org/10.1128/mcb.8.10.4518-4523.1988',
      },
    ],
  },
  {
    id: 'myo5a-dilute',
    name: 'dilute (d) provirus',
    chrom: 'chr9',
    start: 75_097_803,
    end: 75_097_804,
    about:
      "DBA/2J's dilute coat colour comes from an ecotropic murine leukemia provirus integrated in Myo5a; a DBA/2J revertant that lost the provirus lost the mutation with it.",
    inPanel: 'DBA/2J alone',
    drawn: [{ gain: true, bp: 8700, label: 'dilute provirus' }],
    citations: [
      {
        label: 'Jenkins et al. 1981, Nature',
        url: 'https://doi.org/10.1038/293370a0',
      },
    ],
  },
  {
    id: 'nonagouti',
    name: 'nonagouti (a) insertion',
    chrom: 'chr2',
    start: 154_856_868,
    end: 154_871_573,
    about:
      "The original nonagouti allele, which makes a mouse mostly black, is an insertion in agouti's first intron: a VL30 retroelement carrying 5.5 kb of other sequence. C57BL/6J is a/a, so a strain drawn with a 15 kb deletion here lacks the insertion.",
    inPanel:
      'C57BL/6NJ, AKR/J, DBA/2J, A/J and JF1/MsJ share the insertion with C57BL/6J; the other twelve lack it',
    drawn: [{ gain: false, bp: 14_700, label: 'no a insertion' }],
    citations: [
      {
        label: 'Bultman et al. 1994, Genes Dev',
        url: 'https://doi.org/10.1101/gad.8.4.481',
      },
    ],
  },
]
