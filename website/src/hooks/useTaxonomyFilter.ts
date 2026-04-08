import useSWRImmutable from 'swr/immutable'

// Ordered from specific to broad — must match generateTaxonomyFilter.ts
export const CURATED_CLADES = [
  { label: 'Mammalia', display: 'Mammalia (mammals) [txid:40674]' },
  { label: 'Aves', display: 'Aves (birds) [txid:8782]' },
  {
    label: 'Actinopterygii',
    display: 'Actinopterygii (ray-finned fish) [txid:7898]',
  },
  { label: 'Vertebrata', display: 'Vertebrata [txid:7742]' },
  { label: 'Arthropoda', display: 'Arthropoda (arthropods) [txid:6656]' },
  { label: 'Metazoa', display: 'Metazoa (animals) [txid:33208]' },
  { label: 'Viridiplantae', display: 'Viridiplantae (plants) [txid:33090]' },
  { label: 'Fungi', display: 'Fungi [txid:4751]' },
  { label: 'Bacteria', display: 'Bacteria [txid:2]' },
  { label: 'Archaea', display: 'Archaea [txid:2157]' },
  { label: 'Viruses', display: 'Viruses [txid:10239]' },
] as const

async function fetcher(url: string): Promise<Map<string, Set<number>>> {
  const res = await fetch(url)
  const data = (await res.json()) as Record<string, number[]>
  return new Map(Object.entries(data).map(([k, v]) => [k, new Set(v)]))
}

export function useTaxonomyFilter() {
  const { data } = useSWRImmutable('/taxonomyFilter.json', fetcher)
  return data
}
