import useSWRImmutable from 'swr/immutable'

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

async function fetcher(url: string) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(res.statusText)
  }
  return res.json() as Promise<IndexEntry[]>
}

export function useSearchIndex() {
  const { data, isLoading } = useSWRImmutable('/searchIndex.json', fetcher)
  return { index: data ?? [], loading: isLoading }
}
