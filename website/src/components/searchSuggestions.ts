import { rankEntries } from './searchScoring.ts'
import { bareCommonName } from '../utils/names.ts'

import type { IndexEntry } from '../hooks/useSearchIndex.ts'

// One character matches thousands of assemblies and ranks them almost
// arbitrarily, so the header dropdown waits for a second character before it
// scans the index.
export const MIN_SUGGEST_LENGTH = 2

export const MAX_SUGGESTIONS = 8

export function suggestEntries(
  index: IndexEntry[],
  query: string,
  limit = MAX_SUGGESTIONS,
) {
  const trimmed = query.trim()
  const terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean)
  return trimmed.length >= MIN_SUGGEST_LENGTH && terms.length > 0
    ? rankEntries(index, terms).slice(0, limit)
    : []
}

// The assembly leads rather than the species: a query names one organism far
// more often than not, and eight rows all titled "Homo sapiens" tell the user
// nothing about which one to pick. The species goes underneath, where it still
// confirms the match without being repeated as the headline.
export function suggestionTitle(entry: IndexEntry) {
  const parts = [entry[0]]
  if (entry[3] && entry[3] !== entry[0]) {
    parts.push(entry[3])
  }
  return parts.join(' · ')
}

export function suggestionMeta(entry: IndexEntry) {
  const common = bareCommonName(entry[1])
  const scientific = entry[2]
  let meta = scientific || common
  if (
    scientific &&
    common &&
    common.toLowerCase() !== scientific.toLowerCase()
  ) {
    meta = `${scientific} (${common})`
  }
  return meta
}
