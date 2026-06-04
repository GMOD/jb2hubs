export interface Assembly {
  accession: string
  commonName: string
  scientificName: string
  taxonId: number
}

// Compact wire format for ortholog_index.json — kept small for the download.
// Positions: [commonName, scientificName, taxonId]
type IndexEntry = [string, string, number]
export type AssemblyIndex = Record<string, IndexEntry>

function stripVersion(accession: string) {
  return accession.replace(/\.\d+$/, '')
}

// Wraps the assembly index as a queryable store.
// NCBI's ortholog API sometimes returns a different assembly version than what
// we host; find() falls back to a version-stripped match so near-version hits
// still resolve (JBrowse's refName aliasing handles the rest).
export function createStore(data: AssemblyIndex) {
  const byBase = new Map(Object.keys(data).map(acc => [stripVersion(acc), acc]))

  return {
    find(accession: string): Assembly | undefined {
      const key = data[accession]
        ? accession
        : byBase.get(stripVersion(accession))
      const entry = key ? data[key] : undefined
      if (!entry || !key) {
        return undefined
      }
      return {
        accession: key,
        commonName: entry[0],
        scientificName: entry[1],
        taxonId: entry[2],
      }
    },
  }
}

export type AssemblyStore = ReturnType<typeof createStore>
