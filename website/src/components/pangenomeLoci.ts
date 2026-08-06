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
  // Narrower window for the two launches that draw per-haplotype data — the
  // graph and the 464-row genotype matrix — when the display span above is too
  // wide for either (see MAX_DETAIL_WINDOW_BP). Where the JBrowse HPRC tutorial
  // states a window for this locus, it is that window verbatim.
  detailWindow?: { start: number; end: number }
  // Set where minigraph is known to collapse this locus, so no graph launch is
  // offered however narrow the window. The HPRC tutorial's "The Layout dropdown"
  // names the class: near-identical segmental duplications merge onto one path,
  // "which rules this graph out for the whole class of genes defined by one:
  // SMN1/SMN2, RHD/RHCE, PMS2/PMS2CL and the CYP clusters among them". A quiet
  // window there means collapsed, not checked-and-invariant, so a graph button
  // would open a bare thread and read as an empty result.
  graphCollapsed?: boolean
}

// Two different limits that land in the same place, which is why one constant
// serves both launches:
//
// - A graph draws a window at a time, and the layout scales itself to a target
//   node size — so ten times the nodes is the same ink at a tenth the size, and
//   a megabase-wide locus draws as one unreadable thread rather than as loops.
// - The 464-haplotype callset is fetched per view: over this locus set the wave
//   VCF runs ~200 bytes/bp of VCF text, so a multi-Mb window is past both the
//   adapter's `fetchSizeLimit` and the feature-density gate, and the lane opens
//   behind the "too much data" banner instead of drawing.
//
// The tutorial's own windows run 70–130 kb (its widest is LPA's KIV-2 repeat at
// 130 kb); 150 kb is the ceiling allowed here. Past it a locus needs an explicit
// `detailWindow`, or it gets no graph launch and its variants open on the full
// span.
export const MAX_DETAIL_WINDOW_BP = 150_000

/**
 * The window to cut a subgraph from and to open the genotype matrix on, or
 * undefined if this locus is too wide and names none.
 */
export function detailWindow(locus: PangenomeLocus) {
  return locus.detailWindow
    ? locus.detailWindow
    : locus.end - locus.start <= MAX_DETAIL_WINDOW_BP
      ? { start: locus.start, end: locus.end }
      : undefined
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
    // The class II stretch, which is where the graph's structure is legible; the
    // full 5 Mb MHC is a linear view's job. The tutorial's MHC class II window
    // verbatim — it covers HLA-DRB5 (32,517,353-32,530,287) *and* HLA-DRB1
    // (32,578,775-32,589,848), where the window this used to carry
    // (32,500,000-32,560,000) stopped 19 kb short of DRB1. C4 is not in here at
    // all: C4A is chr6:31,982,057-32,002,681, which is the separate `c4` locus.
    detailWindow: { start: 32_510_000, end: 32_600_000 },
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
    // The tutorial's AMY1 window verbatim.
    detailWindow: { start: 103_690_000, end: 103_780_000 },
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
    // The tutorial's C4 window verbatim; covers C4A (31,982,057-32,002,681) and
    // C4B (32,014,795-32,035,418).
    detailWindow: { start: 31_980_000, end: 32_050_000 },
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
    // The tutorial's LPA KIV-2 window verbatim — the repeat inside LPA
    // (160,531,482-160,664,275), and the widest window it draws as a graph.
    detailWindow: { start: 160_525_000, end: 160_655_000 },
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
    // RHD (25,272,509-25,330,445) with flanks. No graph: RHD/RHCE is one of the
    // paralog pairs the tutorial names as collapsed.
    detailWindow: { start: 25_260_000, end: 25_345_000 },
    graphCollapsed: true,
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
    start: 70_040_000,
    end: 70_960_000,
    // SMN1 (70,925,087-70,953,015) with flanks. No graph: the tutorial queries
    // chr5:70,925,000-70,954,000 against the allele inventory and gets nothing
    // back, because minigraph merged SMN1 and SMN2 onto one path.
    detailWindow: { start: 70_910_000, end: 70_970_000 },
    graphCollapsed: true,
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
    // The tutorial's KIR window verbatim, inside the KIR3DL3..KIR3DL2 span
    // (54,724,442-54,867,207) the display window covers whole.
    detailWindow: { start: 54_750_000, end: 54_840_000 },
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
    end: 7_900_000,
    // The defensin cluster itself, DEFB103A (7,881,392-7,882,663) through DEFB4A
    // (7,894,677-7,896,716), with flanks; the flanking inversion is the megabase
    // display window's subject.
    detailWindow: { start: 7_850_000, end: 7_930_000 },
    variation: ['cnv', 'inversion'],
    pangeneGenes: [
      'DEFB103A',
      'DEFB104B',
      'DEFB105A',
      'DEFB106B',
      'DEFB107B',
      'DEFB4B',
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
    // FCGR2A (161,505,457-161,519,829) through FCGR3B (161,623,196-161,631,176),
    // i.e. the whole low-affinity receptor cluster.
    detailWindow: { start: 161_495_000, end: 161_640_000 },
    variation: ['cnv', 'pav'],
    pangeneGenes: ['FCGR2A', 'FCGR2B', 'FCGR2C', 'FCGR3A', 'FCGR3B'],
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
    // No graph: CYP2D6/CYP2D7 is a CYP cluster, which the tutorial names among
    // the paralog pairs minigraph collapses onto one path. The window is small
    // enough to draw, which is exactly why the button has to be suppressed
    // explicitly rather than by the width rule.
    graphCollapsed: true,
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
    // The 5' end of SRGAP2 (NM_015326.5, chr1:206,203,540-206,464,436, `+`
    // strand — so 5' really is the low coordinate). The gene is 261 kb and no
    // window holds all of it.
    //
    // Be precise about what this covers, because the obvious description
    // overstates it: SRGAP2B/C are truncated copies of exons 1-9, which span
    // 206,203,540-206,405,248 — about 202 kb, corroborated by SRGAP2C's own
    // 208 kb span at chr1:121,184,975-121,392,874. This window holds exons 1-3
    // of those 9, i.e. the 5' third of the duplicated segment, not the whole of
    // it. Covering all nine would need ~210 kb and blow past
    // MAX_DETAIL_WINDOW_BP (which `detailWindow()` does not actually enforce on
    // an explicit window, so that would be a deliberate exception, not a
    // typo). Exon coordinates from UCSC ncbiRefSeqSelect, checked 2026-08-06.
    detailWindow: { start: 206_190_000, end: 206_330_000 },
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
    // GYPB (143,996,104-144,019,380) through GYPA (144,109,303-144,140,718) —
    // the pair the hybrid alleles recombine between.
    detailWindow: { start: 143_990_000, end: 144_140_000 },
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
    // The CFHR3–CFHR1 deletion the tutorial's CFHR figure is built on: the wave
    // VCF writes it as one record at chr1:196,753,075 with an 84,684 bp REF, so
    // this window holds the whole event plus CFHR3 (196,774,840-196,795,407) and
    // CFHR1 (196,819,731-196,832,189) with flanks.
    detailWindow: { start: 196_740_000, end: 196_850_000 },
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
