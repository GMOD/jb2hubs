// Shape of the precomputed per-locus JSON under public/pangenome/, produced by
// `website/generatePangenomeData.ts` and loaded by the explorer.

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
  // Variant sites: one per VCF record in the locus.
  variantCount: number
  // ALT alleles across those sites. Higher than `variantCount` wherever a site
  // is multi-allelic, which at these loci is common — the histograms below are
  // per allele, since AF/LEN/TYPE are stated per allele.
  alleleCount: number
  typeCounts: Record<string, number>
  afHistogram: Bin[]
  sizeHistogram: Bin[]
  sampleBurden: { sample: string; count: number }[]
}
