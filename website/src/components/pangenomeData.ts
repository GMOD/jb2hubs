// Shapes of the precomputed per-locus JSON under public/pangenome/, produced by
// the website/generatePangenome*.ts scripts and loaded by the explorer.

export interface Bin {
  label: string
  count: number
}

export interface LocusSummary {
  id: string
  gene: string
  region: string
  ref: string
  source: string
  variantCount: number
  typeCounts: Record<string, number>
  afHistogram: Bin[]
  sizeHistogram: Bin[]
  sampleBurden: { sample: string; count: number }[]
}

export interface PangeneData {
  id: string
  source: string
  // PanSN haplotype identifiers (sample#hapIdx); references are GRCh38#0 / CHM13#0.
  haplotypes: string[]
  genes: string[]
  // matrix[geneIndex][haplotypeIndex] = copy number of the gene on that haplotype.
  matrix: number[][]
}
