import useSWRImmutable from 'swr/immutable'

import { fetchJson } from '../lib/fetchJson.ts'

// Compact rows produced by generateSearchIndex.ts — see there for how each field
// is derived.
export type IndexEntry = [
  string, // accession (a UCSC db name for source 'ucsc')
  string, // commonName
  string, // scientificName
  string, // assemblyName
  string, // assemblyStatus
  string, // source ('ucsc', or the GenArk category)
  number, // taxonId
  number, // ncbiStatus: 0=none, 1=reference genome, 2=suppressed, 3=both
  number, // year the assembly was released, 0 if unknown
  number, // UCSC's preference order within the species (1 = first), 0 = unranked
  string, // altAccession: the GC[AF] accession of a UCSC db, '' for GenArk
]

// `enabled` gates the fetch, so a component that only sometimes needs the index
// (the header typeahead, which is on every page) can defer the several-megabyte
// download until the user actually engages with it. The SWR key is shared, so a
// page that loads the index eagerly and one that defers it hit the same cache
// entry and download it once.
export function useSearchIndex(enabled = true) {
  const { data, isLoading } = useSWRImmutable(
    enabled ? '/searchIndex.json' : null,
    fetchJson<IndexEntry[]>,
  )
  return { index: data ?? [], loading: isLoading }
}
