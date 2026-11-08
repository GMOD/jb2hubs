import { SEARCH_INDEX_URL, loadSearchIndex } from '../lib/searchIndex.ts'
import { useSWRImmutable } from '../lib/swr.ts'

// The fetcher is loadJsonOnce rather than fetchJson so this shares one download
// with the header typeahead (headerSearch.ts), which is not a React island and
// loads the same several-megabyte file through the same promise cache. A failed
// load is evicted there, so `retry` downloads again rather than replaying it.
export function useSearchIndex() {
  const { data, error, isLoading, mutate } = useSWRImmutable(
    SEARCH_INDEX_URL,
    loadSearchIndex,
  )
  return {
    index: data ?? [],
    loading: isLoading,
    error,
    retry: () => {
      void mutate()
    },
  }
}
