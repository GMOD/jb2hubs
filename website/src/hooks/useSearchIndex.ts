import useSWRImmutable from 'swr/immutable'

import { fetchJson } from '../lib/fetchJson.ts'

// [accession, commonName, scientificName, ncbiAssemblyName, assemblyStatus, source, taxonId, ncbiStatus]
// ncbiStatus: 0=none, 1=reference genome, 2=suppressed, 3=both
export type IndexEntry = [
  string, // accession
  string, // commonName
  string, // scientificName
  string, // ncbiAssemblyName
  string, // assemblyStatus
  string, // source
  number, // taxonId
  number, // ncbiStatus
]

export function useSearchIndex() {
  const { data, isLoading } = useSWRImmutable(
    '/searchIndex.json',
    fetchJson<IndexEntry[]>,
  )
  return { index: data ?? [], loading: isLoading }
}
