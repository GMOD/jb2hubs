// Tolerant lookup over the precomputed pairwise-synteny catalog
// (synteny_pairs.json: "genome1,genome2" -> trackId). A key's two halves are
// versioned accessions, sometimes carrying an assembly-name suffix
// (e.g. GCF_000001735.4_TAIR10.1). Matching on the version-and-suffix-stripped
// base makes lookups robust to whichever version a caller happens to hold, and
// is order-insensitive. Shared by every synteny drill-down (the ortholog table
// and the gene-order neighborhood view) so the matching rule lives once.

export type PairIndex = Map<string, string>

// GCF_000001405.40 or GCF_000001735.4_TAIR10.1 -> GCF_000001405 / GCF_000001735,
// so accessions match regardless of version or assembly-name suffix.
export function accessionBase(accession: string) {
  const [prefix, id] = accession.split('_')
  return prefix && id ? `${prefix}_${id.replace(/\.\d+$/, '')}` : accession
}

export function buildPairIndex(pairs: Record<string, string>): PairIndex {
  const index: PairIndex = new Map()
  for (const [key, trackId] of Object.entries(pairs)) {
    const [a, b] = key.split(',')
    if (a && b) {
      index.set(`${accessionBase(a)}|${accessionBase(b)}`, trackId)
    }
  }
  return index
}

export function trackFor(index: PairIndex, a: string, b: string) {
  return (
    index.get(`${accessionBase(a)}|${accessionBase(b)}`) ??
    index.get(`${accessionBase(b)}|${accessionBase(a)}`)
  )
}
