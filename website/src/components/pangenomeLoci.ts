// Curated loci where genome structure varies between haplotypes, offered as
// examples on /pangenomes/<id>. Coordinates are 0-based half-open, on the
// dataset's own sequence names. `id` is a stable slug
// `check-pangenome-launches --loci` filters on. The human loci are below, on
// GRCh38; the other graphs' are in `pangenome{Mouse,Bovine,Arabidopsis}Loci.ts`.

export interface PangenomeLocus {
  id: string
  gene: string
  fullName: string
  chrom: string
  start: number
  end: number
  // The graph is a bare thread over the window, which reads as an empty result,
  // so no graph launch is offered. Minigraph merges near-identical segmental
  // duplications onto one path (SMN1/SMN2, RHD/RHCE, the CYP clusters), and it
  // has no bubble for an inversion (Arabidopsis's chromosome 4 knob).
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
    start: 25_260_000,
    end: 25_345_000,
    graphCollapsed: true,
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
    graphCollapsed: true,
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
    start: 68_530_000,
    end: 68_680_000,
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
