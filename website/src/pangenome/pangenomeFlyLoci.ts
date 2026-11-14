// Curated examples on /pangenomes/fly, on dm6, 0-based half-open; no bubble
// crosses a window's edge (measured 2026-11-14).
//
// Declined, since the sidecar does not show the paper's allele:
// - cut: no insertion upstream of ct for BDSC_6027, no call for BDSC_1570
// - yellow: no record of BDSC_6027's 622 bp exon insertion
// - Drsl5: no bubble for KSA2's (A4's) tandem duplication

import type { KnownAllele } from './pangenomeKnownAlleles.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

export const FLY_PANGENOME_LOCI: PangenomeLocus[] = [
  {
    // A bare visit opens the first example, so it is the clearest map.
    id: 'garnet',
    gene: 'garnet (g)',
    names: ['garnet', 'g'],
    fullName: 'garnet eye color locus',
    chrom: 'chrX',
    start: 13_720_000,
    end: 13_745_000,
  },
  {
    id: 'cyp28d1',
    gene: 'Cyp28d1',
    names: ['Cyp28d2'],
    fullName: 'Cytochrome P450 28d1, a nicotine resistance QTL',
    chrom: 'chr2L',
    start: 5_200_000,
    end: 5_220_000,
  },
  {
    id: 'strn-mlck',
    gene: 'Strn-Mlck',
    fullName: 'Stretchin-Mlck, the Curved (c) wing locus',
    // Ends before the PEVK-repeat copy-number bubbles at 15,970,174, which
    // split the panel into a dozen forms and hide the one-stock insertion.
    chrom: 'chr2R',
    start: 15_940_000,
    end: 15_966_000,
  },
  {
    id: 'plexus',
    gene: 'plexus (px)',
    names: ['plexus', 'px'],
    fullName: 'plexus wing vein locus',
    chrom: 'chr2R',
    start: 22_490_000,
    end: 22_565_000,
  },
  {
    id: 'forked',
    gene: 'forked (f)',
    names: ['forked', 'f'],
    fullName: 'forked bristle locus',
    chrom: 'chrX',
    start: 17_229_000,
    end: 17_284_000,
  },
  {
    id: 'raspberry',
    gene: 'raspberry (ras)',
    names: ['raspberry', 'ras'],
    fullName: 'raspberry eye color locus',
    chrom: 'chrX',
    start: 10_738_000,
    end: 10_752_000,
  },
  {
    id: 'white',
    gene: 'white (w)',
    names: ['white', 'w'],
    fullName: 'white eye color locus',
    chrom: 'chrX',
    start: 2_788_000,
    end: 2_800_000,
  },
  {
    id: 'chkov1',
    gene: 'CHKov1',
    names: ['CHKov2'],
    fullName: 'Choline kinase-like CHKov1 and CHKov2',
    chrom: 'chr3R',
    start: 25_320_000,
    end: 25_335_000,
  },
  {
    id: 'jheh',
    gene: 'Jheh1',
    names: ['Jheh2', 'Jheh3', 'Jheh'],
    fullName: 'Juvenile hormone epoxide hydrolases',
    chrom: 'chr2R',
    start: 18_850_000,
    end: 18_865_000,
  },
  {
    id: 'cyp6g1',
    gene: 'Cyp6g1',
    names: ['Cyp6g2', 'DDT-R'],
    fullName: 'Cytochrome P450 6g1, the DDT resistance locus',
    // No known allele: the Accord insertion falls inside the one bubble, so the
    // sidecar draws its carriers as the reference.
    chrom: 'chr2R',
    start: 12_180_000,
    end: 12_195_000,
  },
]

const SAMANO_2026 = {
  label: 'Samano et al. 2026, Genome Res',
  url: 'https://doi.org/10.1101/gr.281434.125',
}

// Carriers read off the sidecar on 2026-11-14. dm6's own Doc and Bari1 are
// named by UCSC's RepeatMasker track.
export const FLY_KNOWN_ALLELES: KnownAllele[] = [
  {
    id: 'garnet-g1',
    name: 'g¹ blood insertion',
    chrom: 'chrX',
    start: 13_729_721,
    end: 13_729_722,
    about:
      'The g¹ allele of the eye color gene garnet carries a 7.4 kb blood retrotransposon in an intron. The g² allele has no insertion; an in-frame deletion and an amino-acid change in its last exon mark it instead.',
    inPanel: 'BDSC_5295 and BDSC_6027',
    drawn: [{ gain: true, bp: 7400, label: 'blood (g¹)' }],
    citations: [SAMANO_2026],
  },
  {
    id: 'cyp28d1-dups',
    name: 'Cyp28d1 duplications',
    chrom: 'chr2L',
    start: 5_209_855,
    end: 5_211_833,
    about:
      "DSPR founders carry extra copies of Cyp28d1 and Cyp28d2 at a QTL for nicotine resistance: A2 two copies of a 15 kb segment holding both genes, B1 three copies, B4 a 6 kb tandem duplication. A1 has B4's duplication with a TE inside the second Cyp28d1 copy, and expresses the gene less. A2 and B4 resist nicotine best and express Cyp28d1 most. dm6 has the single-copy allele.",
    inPanel:
      'BOG1_A2 (A2) and CantonS_Yunnan +15 kb, BER1_B1 (B1) +38 kb, RVC3_B4 (B4) +6.1 kb, Canton-S_A1 (A1), BDSC_1282 and BDSC_6027 +11 kb, KSA2 and A4_HiFi +5.3 kb, SAM_HiFi +3.3 kb',
    drawn: [
      { gain: true, bp: 15_000, label: 'Cyp28d1–Cyp28d2 duplication' },
      { gain: true, bp: 38_000, label: 'Cyp28d1–Cyp28d2 copies' },
      { gain: true, bp: 11_000, label: 'Cyp28d1 duplication and TE' },
      { gain: true, bp: 6100, label: 'Cyp28d1 duplication' },
    ],
    citations: [
      {
        label: 'Chakraborty et al. 2019, Nat Commun',
        url: 'https://doi.org/10.1038/s41467-019-12884-1',
      },
    ],
  },
  {
    id: 'strn-mlck-c1',
    name: 'c¹ DM412 insertion',
    chrom: 'chr2R',
    start: 15_953_908,
    end: 15_953_909,
    about:
      'The century-old Curved (c¹) wing mutation maps to a 7.5 kb DM412 retrotransposon inside an exon of the muscle gene Strn-Mlck. Its transcript runs 673 bp into the transposon and stops, losing the downstream exons. Six more c¹ stocks carry the insertion and stocks without c¹ lack it.',
    inPanel: 'BDSC_156 alone',
    drawn: [{ gain: true, bp: 7500, label: 'DM412 (c¹)' }],
    citations: [SAMANO_2026],
  },
  {
    id: 'plexus-px1',
    name: 'px¹ duplication and DM412',
    chrom: 'chr2R',
    start: 22_555_868,
    end: 22_556_834,
    about:
      "The plexus (px¹) wing-vein mutation is a 1.5 kb tandem duplication of the 5′ region of px's first coding exon, its two copies separated by a 7.4 kb DM412 retrotransposon. The transcript takes in 462 bp of transposon and ends early.",
    inPanel: 'BDSC_156 alone',
    drawn: [{ gain: true, bp: 9000, label: 'px¹ duplication and DM412' }],
    citations: [SAMANO_2026],
  },
  {
    id: 'forked-f1',
    name: 'f¹ gypsy insertion',
    chrom: 'chrX',
    start: 17_278_204,
    end: 17_278_205,
    about:
      'The forked (f¹) bristle allele was tied to a gypsy retrotransposon in an intron of forked. Of three stocks with forked bristles, two carry it; the third, BDSC_1570, lacks it and has a 2.7 kb tandem duplication of a whole exon instead.',
    inPanel: 'BDSC_5295 and BDSC_6027; BDSC_1570 has no call here',
    drawn: [{ gain: true, bp: 7500, label: 'gypsy (f¹)' }],
    citations: [SAMANO_2026],
  },
  {
    id: 'raspberry-ras2',
    name: 'ras² blastopia insertion',
    chrom: 'chrX',
    start: 10_740_107,
    end: 10_740_145,
    about:
      'The ras² allele of the eye color gene raspberry is linked to a 5 kb blastopia retrotransposon. Two stocks recorded with different ras alleles both carry it at the same site.',
    inPanel: 'BDSC_6027; BDSC_1570, which also carries it, has no call here',
    drawn: [{ gain: true, bp: 5400, label: 'blastopia (ras²)' }],
    citations: [SAMANO_2026],
  },
  {
    id: 'white-doc',
    name: 'w Doc insertion',
    chrom: 'chrX',
    start: 2_796_497,
    end: 2_796_505,
    about:
      "The w¹ allele of white was tied to a transposon near the gene's transcription start, a 4.7 kb Doc element. BDSC_5295, recorded as w¹¹¹⁸, lacks that allele's deletion and instead carries the Doc with a 3.5 kb copia nested inside it.",
    inPanel:
      'BDSC_5295, with the nested copia. BDSC_6027 has no call here, and the graph draws no insertion here for BDSC_1570, which Samano et al. found carries the Doc',
    drawn: [{ gain: true, bp: 8800, label: 'Doc and copia' }],
    citations: [SAMANO_2026],
  },
  {
    id: 'chkov1-doc',
    name: 'CHKov1 Doc insertion',
    chrom: 'chr3R',
    start: 25_324_411,
    end: 25_328_924,
    about:
      "A Doc transposon in CHKov1's coding sequence truncates the protein and raises resistance to an organophosphate insecticide and to the sigma virus. It spread recently under selection and is now the commonest form of the gene. dm6 carries it, so a strain drawn with a 4.5 kb deletion here has the susceptible allele.",
    inPanel:
      'dm6 and 22 of the 29 assemblies; OreR, BOG1_A2, BDSC_1349, BDSC_554, BDSC_6027, GUM_HiFi and SAM_HiFi lack it',
    drawn: [{ gain: false, bp: 4500, label: 'no Doc' }],
    citations: [
      {
        label: 'Aminetzach et al. 2005, Science',
        url: 'https://doi.org/10.1126/science.1112699',
      },
      {
        label: 'Magwire et al. 2011, PLoS Genet',
        url: 'https://doi.org/10.1371/journal.pgen.1002337',
      },
    ],
  },
  {
    id: 'jheh-bari',
    name: 'Bari-Jheh',
    chrom: 'chr2R',
    start: 18_858_291,
    end: 18_860_029,
    about:
      'Bari-Jheh, a Bari1 transposon between the Jheh genes, adds antioxidant response elements upstream of Jheh1 and Jheh2, raises their expression and is associated with resistance to oxidative stress. dm6 carries it, so a strain drawn with a 1.7 kb deletion here lacks it.',
    inPanel:
      'dm6 and 23 of the 29 assemblies; Canton-S_A1, Wild5B_A6, A7, BDSC_156, SAM_HiFi and CantonS_Yunnan lack it',
    drawn: [{ gain: false, bp: 1700, label: 'no Bari-Jheh' }],
    citations: [
      {
        label: 'Guio et al. 2014, Mol Ecol',
        url: 'https://doi.org/10.1111/mec.12711',
      },
    ],
  },
]
