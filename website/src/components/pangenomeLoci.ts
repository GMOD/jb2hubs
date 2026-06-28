// Curated catalog of famous human-divergence loci for the pangenome explorer.
//
// Humans are ~99.9% identical, so a flat pangenome browser buries the signal.
// This catalog leads with regions that are textbook examples of the *kinds* of
// divergence — structural/copy-number, gene presence/absence, and hypervariable
// — so the demo teaches those axes at a glance and every region has a real story.
//
// Coordinates are GRCh38 / hg38 (UCSC chr-naming), matching the HPRC
// minigraph-cactus GRCh38 VCF contigs and the hg38 UCSC JBrowse config. Windows
// are deliberately generous so the locus and its structural context are in view.
// `id` is the slug used for generated data filenames under public/pangenome/.

export type DivergenceKind = 'structural' | 'presence-absence' | 'hypervariable'

export interface PangenomeLocus {
  id: string
  gene: string
  fullName: string
  chrom: string
  start: number
  end: number
  kinds: DivergenceKind[]
  story: string
  // Marker genes (pangene node names) whose per-sample copy number is shown as a
  // presence/absence + CNV matrix. Omitted where gene-level copy number isn't the
  // story (e.g. an intragenic VNTR). Names match the lh3/pangene human100 graph.
  pangeneGenes?: string[]
}

export const DIVERGENCE_LABELS: Record<DivergenceKind, string> = {
  structural: 'Structural / copy-number',
  'presence-absence': 'Gene presence / absence',
  hypervariable: 'Hypervariable',
}

export const PANGENOME_LOCI: PangenomeLocus[] = [
  {
    id: 'mhc-hla',
    gene: 'HLA / MHC',
    fullName: 'Major histocompatibility complex',
    chrom: 'chr6',
    start: 28_510_000,
    end: 33_480_000,
    kinds: ['hypervariable', 'structural'],
    story:
      'The most polymorphic region of the human genome. Thousands of HLA alleles and large haplotype-level structural divergence make a single reference a poor fit — the canonical case for a pangenome.',
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
    kinds: ['structural'],
    story:
      'Copy number of the salivary amylase gene varies widely between individuals and tracks dietary starch intake. A classic multi-allelic copy-number locus.',
    pangeneGenes: ['AMY1C', 'AMY2A', 'AMY2B'],
  },
  {
    id: 'c4',
    gene: 'C4A / C4B',
    fullName: 'Complement component 4',
    chrom: 'chr6',
    start: 31_950_000,
    end: 32_080_000,
    kinds: ['structural', 'presence-absence'],
    story:
      'C4 copy number and the C4A/C4B balance vary between haplotypes (plus a HERV-K insertion polymorphism) and are linked to schizophrenia risk via complement-driven synaptic pruning.',
    pangeneGenes: ['C4A', 'C4B'],
  },
  {
    id: 'lpa',
    gene: 'LPA',
    fullName: 'Lipoprotein(a) — kringle IV repeats',
    chrom: 'chr6',
    start: 160_500_000,
    end: 160_700_000,
    kinds: ['structural'],
    story:
      'A variable number of kringle-IV-type-2 repeats sets Lp(a) particle size and plasma level, a major heritable cardiovascular risk factor — a VNTR that short-read references collapse.',
  },
  {
    id: 'rhd',
    gene: 'RHD / RHCE',
    fullName: 'Rh blood group',
    chrom: 'chr1',
    start: 25_250_000,
    end: 25_460_000,
    kinds: ['presence-absence'],
    story:
      'Rh-negative individuals carry a whole-gene deletion of RHD between Rhesus-box repeats — gene presence/absence determining blood type, invisible as ordinary SNPs.',
    pangeneGenes: ['RHD', 'RHCE'],
  },
  {
    id: 'smn',
    gene: 'SMN1 / SMN2',
    fullName: 'Survival motor neuron paralogs',
    chrom: 'chr5',
    start: 70_000_000,
    end: 70_130_000,
    kinds: ['presence-absence', 'structural'],
    story:
      'SMN1 and its near-identical paralog SMN2 sit in a segmental duplication with variable copy number; SMN1 loss causes spinal muscular atrophy and SMN2 copies modify severity.',
    pangeneGenes: ['SMN1'],
  },
  {
    id: 'kir',
    gene: 'KIR',
    fullName: 'Killer-cell immunoglobulin-like receptors',
    chrom: 'chr19',
    start: 54_720_000,
    end: 54_870_000,
    kinds: ['hypervariable', 'presence-absence'],
    story:
      'The KIR locus varies in both gene content and allele sequence between haplotypes, shaping NK-cell immunity — gene presence/absence layered on hypervariability.',
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
    kinds: ['structural'],
    story:
      'The 8p23.1 beta-defensin cluster is a large, highly copy-number-variable antimicrobial-peptide region nested in a recurrent inversion polymorphism.',
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
    kinds: ['structural', 'presence-absence'],
    story:
      'The low-affinity Fc-gamma receptor cluster carries copy-number variants and gene fusions (FCGR2C) affecting antibody-mediated immunity and autoimmune risk.',
    pangeneGenes: ['FCGR1A', 'FCGR2A', 'FCGR2B', 'FCGR2C', 'FCGR3A', 'FCGR3B'],
  },
  {
    id: 'hp',
    gene: 'HP',
    fullName: 'Haptoglobin',
    chrom: 'chr16',
    start: 72_040_000,
    end: 72_090_000,
    kinds: ['structural'],
    story:
      'A common intragenic deletion creates the HP1/HP2 alleles, changing the haptoglobin multimer and altering plasma haptoglobin — a structural allele missed by SNP genotyping.',
    pangeneGenes: ['HP', 'HPR'],
  },
]

export function locusRegion(
  l: Pick<PangenomeLocus, 'chrom' | 'start' | 'end'>,
) {
  return `${l.chrom}:${l.start}-${l.end}`
}
