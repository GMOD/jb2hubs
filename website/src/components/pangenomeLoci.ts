// Curated catalog of human loci where genome structure varies between
// haplotypes — copy number, gene presence/absence, tandem repeats, inversions,
// and allelic hyperdiversity — used by the pangenome explorer.
//
// Coordinates are GRCh38 / hg38 (UCSC chr-naming), matching the HPRC
// minigraph-cactus GRCh38 VCF contigs and the hg38 UCSC JBrowse config. `id` is
// the slug used for the generated data filenames under public/pangenome/.

// Variation classes, using standard dbVar/VCF-aligned terms. A locus can carry
// several. These describe within-species variation (polymorphism).
export type VariationClass =
  | 'cnv' // copy-number variation (segmental gene dosage)
  | 'pav' // gene presence/absence (gene-content variation)
  | 'hyperdiversity' // allelic / sequence hyperdiversity
  | 'vntr' // variable-number tandem repeat
  | 'inversion' // inversion polymorphism

export interface PangenomeLocus {
  id: string
  gene: string
  fullName: string
  // One-sentence, structural-variation-focused note on why the locus is hard for
  // a single linear reference. Kept factual and about the variation itself.
  significance?: string
  chrom: string
  start: number
  end: number
  variation: VariationClass[]
  // Marker genes (pangene node names) whose per-haplotype copy number is shown as
  // a matrix. Omitted where gene-level copy number isn't relevant (e.g. an
  // intragenic VNTR). Names match the lh3/pangene human100 graph.
  pangeneGenes?: string[]
}

export const VARIATION_LABELS: Record<VariationClass, string> = {
  cnv: 'Copy-number variation',
  pav: 'Gene presence / absence',
  hyperdiversity: 'Allelic hyperdiversity',
  vntr: 'Tandem repeat (VNTR)',
  inversion: 'Inversion',
}

export const PANGENOME_LOCI: PangenomeLocus[] = [
  {
    id: 'mhc-hla',
    gene: 'HLA / MHC',
    fullName: 'Major histocompatibility complex',
    significance:
      'The most variable region of the human genome — HLA genes carry thousands of alleles and haplotypes differ by megabases, so any single reference represents it poorly.',
    chrom: 'chr6',
    start: 28_510_000,
    end: 33_480_000,
    variation: ['hyperdiversity', 'cnv'],
    pangeneGenes: [
      'HLA-A',
      'HLA-B',
      'HLA-C',
      'HLA-DRB1',
      'HLA-DRB3',
      'HLA-DRB4',
      'HLA-DRB5',
      'HLA-DQA1',
      'HLA-DQB1',
      'HLA-DPB1',
      'C4A',
      'C4B',
    ],
  },
  {
    id: 'amy1',
    gene: 'AMY1',
    fullName: 'Salivary amylase cluster',
    significance:
      'A textbook copy-number cluster: haplotypes range from a single copy to many tandem copies of the salivary amylase gene AMY1.',
    chrom: 'chr1',
    start: 103_540_000,
    end: 103_830_000,
    variation: ['cnv'],
    pangeneGenes: ['AMY1C', 'AMY2A', 'AMY2B'],
  },
  {
    id: 'c4',
    gene: 'C4A / C4B',
    fullName: 'Complement component 4',
    significance:
      'Complement C4 varies in the copy number of its C4A and C4B genes, and in a long/short form set by a retroviral insertion in intron 9.',
    chrom: 'chr6',
    start: 31_950_000,
    end: 32_080_000,
    variation: ['cnv', 'pav'],
    pangeneGenes: ['C4A', 'C4B'],
  },
  {
    id: 'lpa',
    gene: 'LPA',
    fullName: 'Lipoprotein(a) — kringle IV repeats',
    significance:
      'Apolipoprotein(a) size is set by the KIV-2 variable-number tandem repeat in LPA, which varies several-fold in copy number between haplotypes.',
    chrom: 'chr6',
    start: 160_500_000,
    end: 160_700_000,
    variation: ['vntr'],
  },
  {
    id: 'rhd',
    gene: 'RHD / RHCE',
    fullName: 'Rh blood group',
    significance:
      'RhD-negative blood type is commonly caused by a complete deletion of RHD, so the gene is present on some haplotypes and absent on others.',
    chrom: 'chr1',
    start: 25_250_000,
    end: 25_460_000,
    variation: ['pav'],
    pangeneGenes: ['RHD', 'RHCE'],
  },
  {
    id: 'smn',
    gene: 'SMN1 / SMN2',
    fullName: 'Survival motor neuron paralogs',
    significance:
      'SMN1 and SMN2 are near-identical paralogs in a segmental duplication; both vary in copy number, and loss of SMN1 causes spinal muscular atrophy.',
    chrom: 'chr5',
    start: 70_000_000,
    end: 70_130_000,
    variation: ['cnv', 'pav'],
    pangeneGenes: ['SMN1'],
  },
  {
    id: 'kir',
    gene: 'KIR',
    fullName: 'Killer-cell immunoglobulin-like receptors',
    significance:
      'KIR haplotypes differ in gene content, not just sequence — individuals carry different combinations of activating and inhibitory receptor genes.',
    chrom: 'chr19',
    start: 54_720_000,
    end: 54_870_000,
    variation: ['hyperdiversity', 'pav'],
    pangeneGenes: [
      'KIR3DL3',
      'KIR2DL3',
      'KIR2DL1',
      'KIR3DL2',
      'KIR2DL4',
      'KIR2DS4',
      'KIR3DL1',
      'KIR2DL2',
      'KIR2DL5A',
      'KIR2DL5B',
      'KIR2DS1',
      'KIR2DS2',
      'KIR2DS3',
      'KIR2DS5',
      'KIR3DS1',
    ],
  },
  {
    id: 'defb',
    gene: 'DEFB (8p23.1)',
    fullName: 'Beta-defensin cluster',
    significance:
      'The 8p23.1 beta-defensin cluster is a multiallelic copy-number region flanked by a common large inversion polymorphism.',
    chrom: 'chr8',
    start: 6_900_000,
    end: 7_800_000,
    variation: ['cnv', 'inversion'],
    pangeneGenes: [
      'DEFB103A',
      'DEFB104B',
      'DEFB105A',
      'DEFB106B',
      'DEFB107B',
      'DEFB4B',
      'DEFB130A',
    ],
  },
  {
    id: 'fcgr',
    gene: 'FCGR (1q23.3)',
    fullName: 'Fc-gamma receptor cluster',
    significance:
      'The low-affinity Fcγ-receptor genes undergo copy-number variation and gene conversion between their near-identical paralogs.',
    chrom: 'chr1',
    start: 161_500_000,
    end: 161_700_000,
    variation: ['cnv', 'pav'],
    pangeneGenes: ['FCGR1A', 'FCGR2A', 'FCGR2B', 'FCGR2C', 'FCGR3A', 'FCGR3B'],
  },
  {
    id: 'hp',
    gene: 'HP',
    fullName: 'Haptoglobin',
    significance:
      'Haptoglobin carries a common intragenic duplication (the HP1/HP2 alleles) plus deletion alleles, changing the gene’s length between haplotypes.',
    chrom: 'chr16',
    start: 72_040_000,
    end: 72_090_000,
    variation: ['cnv'],
    pangeneGenes: ['HP', 'HPR'],
  },
  {
    id: 'cyp2d6',
    gene: 'CYP2D6',
    fullName: 'Debrisoquine 4-hydroxylase (drug metabolism)',
    significance:
      'CYP2D6 varies by whole-gene deletions, duplications, and CYP2D6–CYP2D7 hybrid alleles formed by recombination with its adjacent pseudogene, so both copy number and gene structure differ between haplotypes.',
    chrom: 'chr22',
    start: 42_120_000,
    end: 42_140_000,
    variation: ['cnv', 'hyperdiversity'],
    pangeneGenes: ['CYP2D6', 'CYP2D7'],
  },
  {
    id: 'hba',
    gene: 'HBA (α-globin)',
    fullName: 'Alpha-globin cluster',
    significance:
      'The α-globin genes lie in a tandem duplication and are removed by recurrent deletions that cause α-thalassemia, so haplotypes differ in α-globin gene copy number.',
    chrom: 'chr16',
    start: 130_000,
    end: 185_000,
    variation: ['cnv', 'pav'],
    pangeneGenes: ['HBZ', 'HBM', 'HBA2', 'HBQ1'],
  },
  {
    id: 'srgap2',
    gene: 'SRGAP2',
    fullName: 'SRGAP2 human-specific duplications',
    significance:
      'SRGAP2 was copied to new locations only in the human lineage (SRGAP2B/C), and these young paralogs vary in copy number and completeness between haplotypes.',
    chrom: 'chr1',
    start: 206_190_000,
    end: 206_470_000,
    variation: ['cnv', 'pav'],
    pangeneGenes: ['SRGAP2', 'SRGAP2B', 'SRGAP2C'],
  },
  {
    id: 'mns',
    gene: 'GYPA / GYPB',
    fullName: 'MNS blood group (glycophorins)',
    significance:
      'The glycophorin genes recombine and gene-convert between near-identical copies, producing hybrid alleles (e.g. the malaria-protective Dantu variant) and copy-number differences.',
    chrom: 'chr4',
    start: 143_860_000,
    end: 144_150_000,
    variation: ['pav', 'cnv'],
    pangeneGenes: ['GYPA', 'GYPB', 'GYPE'],
  },
  {
    id: 'cfhr',
    gene: 'CFH / CFHR',
    fullName: 'Complement factor H-related cluster',
    significance:
      'The CFHR genes undergo recurrent deletions and gene conversion between paralogs — the common CFHR3–CFHR1 deletion is one example — changing gene content between haplotypes.',
    chrom: 'chr1',
    start: 196_640_000,
    end: 197_020_000,
    variation: ['pav', 'cnv'],
    pangeneGenes: ['CFH', 'CFHR1', 'CFHR2', 'CFHR3', 'CFHR4', 'CFHR5'],
  },
  {
    id: 'prss',
    gene: 'PRSS1 / PRSS2',
    fullName: 'Trypsinogen cluster',
    significance:
      'The trypsinogen locus carries a common copy-number variant spanning PRSS1/PRSS2 that alters trypsinogen gene dosage and modifies pancreatitis risk.',
    chrom: 'chr7',
    start: 142_740_000,
    end: 142_780_000,
    variation: ['cnv', 'pav'],
    pangeneGenes: ['PRSS1', 'PRSS2'],
  },
  {
    id: 'ugt2b17',
    gene: 'UGT2B17',
    fullName: 'UDP-glucuronosyltransferase 2B17',
    significance:
      'UGT2B17 is subject to a common whole-gene deletion that removes the entire gene on many haplotypes, making this drug- and hormone-metabolizing enzyme frequently null.',
    chrom: 'chr4',
    start: 68_530_000,
    end: 68_680_000,
    variation: ['pav', 'cnv'],
    pangeneGenes: ['UGT2B17', 'UGT2B15'],
  },
  {
    id: 'nphp1',
    gene: 'NPHP1',
    fullName: 'Nephrocystin-1',
    significance:
      'NPHP1 sits between large segmental duplications that drive a recurrent ~290 kb deletion of the gene, so it is present or absent depending on the haplotype.',
    chrom: 'chr2',
    start: 110_080_000,
    end: 110_210_000,
    variation: ['pav'],
    pangeneGenes: ['NPHP1', 'MALL'],
  },
  {
    id: 'gstm1',
    gene: 'GSTM1',
    fullName: 'Glutathione S-transferase Mu 1',
    significance:
      'GSTM1 carries a very common whole-gene deletion (the null allele), so a large fraction of haplotypes lack the gene entirely.',
    chrom: 'chr1',
    start: 109_680_000,
    end: 109_715_000,
    variation: ['pav'],
    pangeneGenes: ['GSTM1'],
  },
  {
    id: 'pga',
    gene: 'PGA3/4/5',
    fullName: 'Pepsinogen A cluster',
    significance:
      'The pepsinogen A genes form a tandem array whose copy number varies between haplotypes — the molecular basis of the classic pepsinogen electrophoretic polymorphisms.',
    chrom: 'chr11',
    start: 61_195_000,
    end: 61_258_000,
    variation: ['cnv'],
    pangeneGenes: ['PGA3', 'PGA4', 'PGA5'],
  },
]

export function locusRegion(
  l: Pick<PangenomeLocus, 'chrom' | 'start' | 'end'>,
) {
  return `${l.chrom}:${l.start}-${l.end}`
}

// A real NCBI gene symbol to seed the cross-species gene-order view: the first
// pangene marker (e.g. HLA-A) when present, else the first token of the display
// name ("C4A / C4B" -> C4A, "LPA" -> LPA).
export function syntenyGene(locus: PangenomeLocus) {
  return locus.pangeneGenes?.[0] ?? locus.gene.split(/[\s/]/)[0]!
}
