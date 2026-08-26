import { loadJsonOnce } from '../lib/fetchJson.ts'

export interface Assembly {
  accession: string
  commonName: string
  scientificName: string
  taxonId: number
  // UCSC browser db (hg38, mm39, …) when this assembly is a native UCSC genome
  // rather than a GenArk hub. Present only for the ~hundreds of assemblies UCSC
  // serves directly; drives which JBrowse config a launch URL targets.
  ucscDb?: string
}

// The species part of an index common name. 43,828 of the 44,685 entries are
// really "<display name> (<strain/version/year/source>)" — "cattle (Hereford L1
// Dominette 01449 42190680 v1.3 2018 USDA)" — and beside a scientific name in a
// table of several hundred rows that trailing detail is what makes the column
// unreadable. Only a parenthetical that ENDS the string is dropped, and only
// when something is left, so a name that is nothing but parentheses survives.
// The assembly is still identified in its own column; callers keep the full
// string as a tooltip.
export function speciesLabel(commonName: string) {
  const trimmed = commonName.replace(/\s*\([^()]*\)$/, '').trim()
  return trimmed || commonName
}

// Compact wire format for ortholog_index.json — kept small for the download.
// Positions: [commonName, scientificName, taxonId, ucscDb?]. The 4th slot is
// present only for UCSC-native assemblies (see Assembly.ucscDb).
type IndexEntry = [string, string, number] | [string, string, number, string]
export type AssemblyIndex = Record<string, IndexEntry>

function stripVersion(accession: string) {
  return accession.replace(/\.\d+$/, '')
}

function version(accession: string) {
  const m = /\.(\d+)$/.exec(accession)
  return m ? Number(m[1]) : 0
}

// Wraps the assembly index as a queryable store.
// NCBI's ortholog API sometimes returns a different assembly version than what
// we host; find() falls back to a version-stripped match so near-version hits
// still resolve (JBrowse's refName aliasing handles the rest). When we host
// several versions of one base, the fallback deterministically picks the newest
// rather than whichever happened to be last in key order.
export function createStore(data: AssemblyIndex) {
  const byBase = new Map<string, string>()
  for (const acc of Object.keys(data)) {
    const base = stripVersion(acc)
    const existing = byBase.get(base)
    if (!existing || version(acc) > version(existing)) {
      byBase.set(base, acc)
    }
  }

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
        ucscDb: entry[3],
      }
    },
  }
}

export type AssemblyStore = ReturnType<typeof createStore>

// The store, fetched and built at most once per page from the (~4 MB) index.
// Async callers take it from here rather than being handed one, so a search can
// start before the index has landed and simply await it.
let storePromise: Promise<AssemblyStore> | undefined

export function loadStore() {
  storePromise ??= loadJsonOnce<AssemblyIndex>('/ortholog_index.json').then(
    createStore,
  )
  return storePromise
}
