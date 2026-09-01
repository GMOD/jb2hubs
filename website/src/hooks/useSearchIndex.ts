import useSWRImmutable from 'swr/immutable'

import { loadJsonOnce } from '../lib/fetchJson.ts'
import { SEARCH_INDEX_URL } from '../lib/searchIndex.ts'

import type { IndexEntry } from '../lib/searchIndex.ts'

export type { IndexEntry }

// The fetcher is loadJsonOnce rather than fetchJson so this shares one download
// with the header typeahead (headerSearch.ts), which is not a React island and
// loads the same several-megabyte file through the same promise cache.
export function useSearchIndex() {
  const { data, isLoading } = useSWRImmutable(SEARCH_INDEX_URL, url =>
    loadJsonOnce<IndexEntry[]>(url),
  )
  return { index: data ?? [], loading: isLoading }
}
