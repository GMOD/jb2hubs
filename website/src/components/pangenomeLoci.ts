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
    chrom: 'chr6',
    start: 160_500_000,
    end: 160_700_000,
    variation: ['vntr'],
  },
  {
    id: 'rhd',
    gene: 'RHD / RHCE',
    fullName: 'Rh blood group',
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
    chrom: 'chr16',
    start: 72_040_000,
    end: 72_090_000,
    variation: ['cnv'],
    pangeneGenes: ['HP', 'HPR'],
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
