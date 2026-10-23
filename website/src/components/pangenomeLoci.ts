// Curated loci where genome structure varies between haplotypes, offered as
// examples on /pangenomes/<id>. Coordinates are 0-based half-open, on the
// dataset's own sequence names. `id` is a stable slug
// `check-pangenome-launches --loci` filters on. The human loci are below, on
// GRCh38; the other graphs' are in `pangenome{Mouse,Bovine,Arabidopsis}Loci.ts`.

import type { KnownAllele } from './pangenomeKnownAlleles.ts'

export interface PangenomeLocus {
  id: string
  gene: string
  fullName: string
  chrom: string
  start: number
  end: number
  // The graph is a bare thread over the window, which reads as an empty result,
  // so no graph launch is offered. Minigraph merges near-identical segmental
  // duplications onto one path (SMN1/SMN2), and it has no bubble for an
  // inversion (Arabidopsis's chromosome 4 knob).
  graphCollapsed?: boolean
  // The callset's matrix is blank over the window, so no variants launch is
  // offered: either the callset has no record there, where the launch never
  // leaves "Loading…", or none of 50 bp or more that draws at the window's
  // zoom. Measured 2026-10-08 on the release 2 `pgbi.vcf.gz`; each locus says
  // which.
  callsetBlank?: boolean
  // Not offered as an example, since no launch shows enough. The locus stays
  // for its flags, which a typed window over it still needs.
  unlisted?: boolean
}

// The widest window drawn at segment level, and the widest the callset opens
// on. Past it a graph is one unreadable thread, and the 464-haplotype callset
// (~200 bytes/bp of VCF text over these loci) is behind "too much data". The
// HPRC tutorial's cuts run 70–130 kb. Every human window fits; a wider one
// draws from the coarse tier.
export const MAX_DETAIL_WINDOW_BP = 150_000

export const isWide = (region: { start: number; end: number }) =>
  region.end - region.start > MAX_DETAIL_WINDOW_BP

export const PANGENOME_LOCI: PangenomeLocus[] = [
  {
    id: 'mhc-hla',
    gene: 'HLA / MHC',
    fullName: 'Major histocompatibility complex',
    // Class II, HLA-DRB5 through HLA-DRB1: the tutorial's window. The whole
    // MHC is 5 Mb.
    chrom: 'chr6',
    start: 32_510_000,
    end: 32_600_000,
  },
  {
    id: 'amy1',
    gene: 'AMY1',
    fullName: 'Salivary amylase cluster',
    // Holds the whole copy-number bubble (chr1:103,620,901-103,732,636 in the
    // v2.1 bubble index) and AMY1C, with no bubble crossing either edge. A cut
    // that starts inside a bubble draws its allele as a short arm.
    chrom: 'chr1',
    start: 103_610_000,
    end: 103_760_000,
    // 64 records of 50 bp or more, the longest 1,456 bp: the copy-number
    // bubble's parent has no record.
    callsetBlank: true,
  },
  {
    id: 'c4',
    gene: 'C4A / C4B',
    fullName: 'Complement component 4',
    chrom: 'chr6',
    start: 31_980_000,
    end: 32_050_000,
  },
  {
    id: 'lpa',
    gene: 'LPA',
    fullName: 'Lipoprotein(a) — kringle IV repeats',
    // The KIV-2 repeat inside LPA.
    chrom: 'chr6',
    start: 160_525_000,
    end: 160_655_000,
  },
  {
    id: 'rhd',
    gene: 'RHD / RHCE',
    fullName: 'Rh blood group',
    chrom: 'chr1',
    // Holds the whole 97 kb RHD deletion site, 25,265,417-25,362,422.
    start: 25_260_000,
    end: 25_370_000,
  },
  {
    id: 'smn',
    gene: 'SMN1 / SMN2',
    fullName: 'Survival motor neuron paralogs',
    chrom: 'chr5',
    start: 70_910_000,
    end: 70_970_000,
    graphCollapsed: true,
    // No callset record in the window.
    callsetBlank: true,
    // 24 forms over a 1.6 Mb snarl whose routes come in over 60 sizes: the
    // commonest lane read "a rarer change at 1 site" and 4 of 8 drew nothing.
    unlisted: true,
  },
  {
    id: 'kir',
    gene: 'KIR',
    fullName: 'Killer-cell immunoglobulin-like receptors',
    chrom: 'chr19',
    start: 54_750_000,
    end: 54_840_000,
  },
  {
    id: 'fcgr',
    gene: 'FCGR (1q23.3)',
    fullName: 'Fc-gamma receptor cluster',
    chrom: 'chr1',
    start: 161_495_000,
    end: 161_640_000,
  },
  {
    id: 'hp',
    gene: 'HP',
    fullName: 'Haptoglobin',
    chrom: 'chr16',
    start: 72_040_000,
    end: 72_090_000,
  },
  {
    id: 'cyp2d6',
    gene: 'CYP2D6',
    fullName: 'Debrisoquine 4-hydroxylase (drug metabolism)',
    chrom: 'chr22',
    start: 42_120_000,
    end: 42_140_000,
  },
  {
    id: 'hba',
    gene: 'HBA (α-globin)',
    fullName: 'Alpha-globin cluster',
    chrom: 'chr16',
    start: 130_000,
    end: 185_000,
  },
  {
    id: 'mns',
    gene: 'GYPA / GYPB',
    fullName: 'MNS blood group (glycophorins)',
    chrom: 'chr4',
    start: 143_990_000,
    end: 144_140_000,
    // 22 records of 50 bp or more, none visible at 150 kb.
    callsetBlank: true,
  },
  {
    id: 'cfhr',
    gene: 'CFH / CFHR',
    fullName: 'Complement factor H-related cluster',
    // The CFHR3–CFHR1 deletion, one 84,684 bp record at chr1:196,753,075, with
    // both genes and flanks.
    chrom: 'chr1',
    start: 196_740_000,
    end: 196_850_000,
  },
  {
    id: 'prss',
    gene: 'PRSS1 / PRSS2',
    fullName: 'Trypsinogen cluster',
    chrom: 'chr7',
    start: 142_740_000,
    end: 142_780_000,
    // 111 records of 50 bp or more, none visible at 40 kb.
    callsetBlank: true,
  },
  {
    id: 'ugt2b17',
    gene: 'UGT2B17',
    fullName: 'UDP-glucuronosyltransferase 2B17',
    chrom: 'chr4',
    // Holds the whole deletion site, 68,508,113-68,625,427; the window this
    // replaced started inside it.
    start: 68_500_000,
    end: 68_650_000,
    // No record of 50 bp or more: the 117 kb deletion is a skipped path.
    callsetBlank: true,
  },
  {
    id: 'nphp1',
    gene: 'NPHP1',
    fullName: 'Nephrocystin-1',
    chrom: 'chr2',
    start: 110_080_000,
    end: 110_210_000,
    // 3 records of 50 bp or more, the longest 109 bp.
    callsetBlank: true,
    // The nephronophthisis deletion is rare, and no haplotype carries it.
    unlisted: true,
  },
  {
    id: 'gstm1',
    gene: 'GSTM1',
    fullName: 'Glutathione S-transferase Mu 1',
    chrom: 'chr1',
    start: 109_680_000,
    end: 109_715_000,
  },
  {
    id: 'gstt1',
    gene: 'GSTT1',
    fullName: 'Glutathione S-transferase theta 1',
    // GRCh38 carries GSTT1 only on chr22_KI270879v1_alt, so on chr22 the gene
    // is a side branch beside GSTT4, walked by about half the haplotypes.
    chrom: 'chr22',
    start: 23_940_000,
    end: 24_070_000,
  },
  {
    id: 'pga',
    gene: 'PGA3/4/5',
    fullName: 'Pepsinogen A cluster',
    chrom: 'chr11',
    start: 61_195_000,
    end: 61_258_000,
  },
  {
    id: 'flna',
    gene: 'FLNA / EMD',
    fullName: 'Filamin A and emerin',
    // The block between the inverted repeats flanking FLNA and EMD, which the
    // graph walks reversed on about half the haplotypes.
    chrom: 'chrX',
    start: 154_340_000,
    end: 154_440_000,
  },
  {
    id: 'srgap2',
    gene: 'SRGAP2',
    fullName: 'SRGAP2 human-specific duplications',
    chrom: 'chr1',
    start: 206_190_000,
    end: 206_330_000,
    // A 5-node graph.
    graphCollapsed: true,
    // No record of 50 bp or more, and no structural form.
    callsetBlank: true,
    unlisted: true,
  },
  {
    id: 'defb',
    gene: 'DEFB (8p23.1)',
    fullName: 'Beta-defensin cluster',
    chrom: 'chr8',
    start: 7_850_000,
    end: 7_930_000,
    // A 7-node graph and one lane.
    graphCollapsed: true,
    // Inside a 550 kb stretch with no callset record
    // (chr8:7,546,668-8,096,808).
    callsetBlank: true,
    unlisted: true,
  },
]

// Carriers read off the v3 sidecar on 2026-10-23, of its 462 haplotypes.
export const HUMAN_KNOWN_ALLELES: KnownAllele[] = [
  {
    id: 'cfhr3-cfhr1-del',
    name: 'CFHR3–CFHR1 deletion',
    chrom: 'chr1',
    start: 196_758_725,
    end: 196_843_410,
    about:
      'A deletion of CFHR3 and CFHR1 on a common CFH haplotype that lowers the risk of age-related macular degeneration. People with two copies have neither protein in their serum.',
    inPanel: '138 of the 462 haplotypes',
    drawn: [{ gain: false, bp: 85_000, label: 'CFHR3–CFHR1 deletion' }],
    citations: [
      {
        label: 'Hughes et al. 2006, Nat Genet',
        url: 'https://doi.org/10.1038/ng1890',
      },
    ],
  },
  {
    id: 'rhd-del',
    name: 'RHD deletion (RhD negative)',
    chrom: 'chr1',
    start: 25_265_417,
    end: 25_362_422,
    about:
      'A deletion of the whole RHD gene inside the Rhesus boxes that flank it; two copies make a person RhD negative. Wagner and Flegel put the haplotype carrying it at about 40% in people of European descent.',
    inPanel: '86 of the 462 haplotypes',
    drawn: [{ gain: false, bp: 70_000, label: 'RHD deletion' }],
    citations: [
      {
        label: 'Wagner and Flegel 2000, Blood',
        url: 'https://pubmed.ncbi.nlm.nih.gov/10845894/',
      },
    ],
  },
  {
    id: 'gstm1-null',
    name: 'GSTM1 deletion (GSTM1*0)',
    chrom: 'chr1',
    start: 109_682_997,
    end: 109_701_443,
    about:
      'A deletion of GSTM1. People with no copy lack the glutathione transferase activity on trans-stilbene oxide that the gene encodes.',
    inPanel:
      'An 18 kb deletion in 390 of the 462 haplotypes, and an 18 kb insertion of a copy beside it in about 80',
    drawn: [],
    citations: [
      {
        label: 'Seidegård et al. 1988, PNAS',
        url: 'https://doi.org/10.1073/pnas.85.19.7293',
      },
    ],
  },
  {
    id: 'ugt2b17-del',
    name: 'UGT2B17 deletion',
    chrom: 'chr4',
    start: 68_508_113,
    end: 68_625_427,
    about:
      'A deletion of the whole UGT2B17 gene, which glucuronidates steroid hormones. Its frequency differs between populations.',
    inPanel: '229 of the 462 haplotypes',
    drawn: [{ gain: false, bp: 120_000, label: 'UGT2B17 deletion' }],
    citations: [
      {
        label: 'Wilson et al. 2004, Genomics',
        url: 'https://doi.org/10.1016/j.ygeno.2004.06.011',
      },
    ],
  },
  {
    id: 'hba-3.7',
    name: '−α3.7 deletion',
    chrom: 'chr16',
    start: 172_417,
    end: 176_222,
    about:
      'The rightward deletion that leaves one α-globin gene where there were two, an α-thalassaemia-2 allele found in African, Mediterranean and Chinese people alike.',
    inPanel: '30 of the 462 haplotypes',
    drawn: [{ gain: false, bp: 3800, label: '−α3.7' }],
    citations: [
      {
        label: 'Embury et al. 1980, J Clin Invest',
        url: 'https://doi.org/10.1172/JCI109984',
      },
    ],
  },
  {
    id: 'hp2-dup',
    name: 'Hp2 duplication',
    chrom: 'chr16',
    start: 72_057_479,
    end: 72_059_195,
    about:
      "Haptoglobin's Hp2 allele carries an intragenic duplication that a crossover between two Hp1 genes made. GRCh38 is Hp2, so a haplotype drawn with a 1.7 kb deletion here is Hp1.",
    inPanel: '189 of the 462 haplotypes are Hp1',
    drawn: [{ gain: false, bp: 1700, label: 'Hp1' }],
    citations: [
      {
        label: 'Maeda et al. 1984, Nature',
        url: 'https://doi.org/10.1038/309131a0',
      },
    ],
  },
  {
    id: 'cyp2d6-5',
    name: 'CYP2D6*5',
    chrom: 'chr22',
    start: 42_123_230,
    end: 42_135_383,
    about:
      'A deletion of the entire CYP2D6 gene. Without a working copy a person is a poor metaboliser of debrisoquine, sparteine and over 25 drugs.',
    inPanel: '21 of the 462 haplotypes',
    drawn: [{ gain: false, bp: 12_000, label: 'CYP2D6*5' }],
    citations: [
      {
        label: 'Gaedigk et al. 1991, Am J Hum Genet',
        url: 'https://pubmed.ncbi.nlm.nih.gov/1673290/',
      },
    ],
  },
]
