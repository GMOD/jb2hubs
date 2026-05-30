import uFuzzy from '@leeoniya/ufuzzy'

export interface RankableOption {
  value: string
  label: string
}

// intraMode 1 allows single-char typos (substitution/transposition/insertion/
// deletion) within a term, so "brca" still finds "BRCA1" and "homosapeins"
// finds "Homo sapiens".
const uf = new uFuzzy({ intraMode: 1 })

// Ranked, capped fuzzy match over an arbitrary list, keyed by a text extractor.
// Empty query returns the head of the (already-sorted) list so focusing a box
// doesn't render thousands of rows. A query runs uFuzzy's out-of-order search
// and returns items best-match-first. Pure + framework-agnostic so both the
// Autocomplete and the data adapters can share it.
export function rankBy<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
  limit = 100,
): T[] {
  const q = query.trim()
  if (!q) {
    return items.slice(0, limit)
  }
  const haystack = items.map(getText)
  const [idxs, info, order] = uf.search(haystack, q, 1)
  if (idxs === null) {
    return []
  }
  // Above uFuzzy's infoThresh `info`/`order` are null and we keep the unranked
  // filter order (capped anyway); otherwise `order` indexes the ranked facets.
  // (info===null discriminates: when it's non-null, order is too.)
  const rankedIdxs =
    info === null ? idxs : order.map(o => info.idx[o]!)
  return rankedIdxs.slice(0, limit).map(i => items[i]!)
}

// Convenience wrapper for the common {value,label} option shape.
export function rankOptions<T extends RankableOption>(
  query: string,
  options: T[],
  limit = 100,
): T[] {
  return rankBy(query, options, o => o.label, limit)
}
