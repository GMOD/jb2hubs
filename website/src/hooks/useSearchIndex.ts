import useSWRImmutable from 'swr/immutable'

// [accession, commonName, scientificName, ncbiAssemblyName, assemblyStatus, source, taxonId]
export type IndexEntry = [string, string, string, string, string, string, number]

async function fetcher(url: string) {
  const res = await fetch(url)
  return res.json() as Promise<IndexEntry[]>
}

export function useSearchIndex() {
  const { data, isLoading } = useSWRImmutable('/searchIndex.json', fetcher)
  return { index: data ?? [], loading: isLoading }
}
