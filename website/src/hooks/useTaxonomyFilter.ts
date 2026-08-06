import useSWRImmutable from 'swr/immutable'

import { fetchJson } from '../lib/fetchJson.ts'

// Keyed by CuratedClade.label — see lib/taxonomyClades.ts, the single list this
// and generateTaxonomyFilter.ts (which writes the file) both read.
async function fetcher(url: string): Promise<Map<string, Set<number>>> {
  const data = await fetchJson<Record<string, number[]>>(url)
  return new Map(Object.entries(data).map(([k, v]) => [k, new Set(v)]))
}

export function useTaxonomyFilter() {
  const { data } = useSWRImmutable('/taxonomyFilter.json', fetcher)
  return data
}
