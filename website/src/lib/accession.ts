// A RefSeq or UniProt accession without its version: NP_000537.3 → NP_000537.
export const bareAccession = (acc: string) => acc.replace(/\.\d+$/, '')

// 40 for GCF_000001405.40, and 0 for an accession that carries none
export function accessionVersion(acc: string) {
  return Number(/\.(\d+)$/.exec(acc)?.[1] ?? 0)
}

// Maps `key` to `accession` unless the map already holds a newer version
export function keepNewest(
  map: Map<string, string>,
  key: string,
  accession: string,
) {
  const existing = map.get(key)
  if (!existing || accessionVersion(accession) > accessionVersion(existing)) {
    map.set(key, accession)
  }
}
