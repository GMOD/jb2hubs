import { checked, isArrayOf, isNumber, isRecordOf } from 'hubtools/guards'

import { fetchJson } from '../lib/fetchJson.ts'
import { useSWRImmutable } from '../lib/swr.ts'

const isCladeFilter = isRecordOf(isArrayOf(isNumber))

// Keyed by CuratedClade.label — see lib/taxonomyClades.ts, the single list this
// and generateTaxonomyFilter.ts (which writes the file) both read.
async function fetcher(url: string): Promise<Map<string, Set<number>>> {
  const data = checked(await fetchJson(url), isCladeFilter, url)
  return new Map(Object.entries(data).map(([k, v]) => [k, new Set(v)]))
}

// The file is 377 KB and only a clade filter reads it, so it is fetched once
// one is chosen rather than on every visit to /search.
export function useTaxonomyFilter(enabled: boolean) {
  const { data, error, isLoading, mutate } = useSWRImmutable(
    enabled ? '/taxonomyFilter.json' : null,
    fetcher,
  )
  return {
    cladeSets: data,
    loading: isLoading,
    error,
    retry: () => {
      void mutate()
    },
  }
}
