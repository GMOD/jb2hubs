import { loadJsonOnce } from '../lib/fetchJson.ts'

// Wire format of /ortholog_index.json, written by generateOrthologIndex.ts.
//
// It carries no species names, and that is the point: the file is fetched by
// every visitor to the gene pages, and NCBI's own ortholog report names the
// species of every row it returns. Two facts are left, both of which the report
// cannot supply — whether an accession is one we host, and the ~60 assemblies
// UCSC serves natively, whose JBrowse launch takes the curated /ucsc/<db>
// config instead of a GenArk hub.
export interface AssemblyIndex {
  schema: 'ortholog-index/2'
  // Every hosted GCF (RefSeq) accession; the only ones NCBI ortholog responses
  // ever name.
  accessions: string[]
  // accession -> UCSC browser db (hg38, mm39, …), present only for the
  // UCSC-native genomes.
  ucscDb: Record<string, string>
}

// What the index knows about one hosted assembly. The names an ortholog row
// displays come from the report that named it, not from here — see
// buildOrthologResults in orthologSearchUtils.ts.
export interface HostedAssembly {
  accession: string
  ucscDb?: string
}

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
// rather than whichever happened to be first in the list.
export function createStore(data: AssemblyIndex) {
  const hosted = new Set(data.accessions)
  const byBase = new Map<string, string>()
  for (const acc of data.accessions) {
    const base = stripVersion(acc)
    const existing = byBase.get(base)
    if (!existing || version(acc) > version(existing)) {
      byBase.set(base, acc)
    }
  }

  return {
    find(accession: string): HostedAssembly | undefined {
      const key = hosted.has(accession)
        ? accession
        : byBase.get(stripVersion(accession))
      return key ? { accession: key, ucscDb: data.ucscDb[key] } : undefined
    },
  }
}

export type AssemblyStore = ReturnType<typeof createStore>

// The store, fetched and built at most once per page. Async callers take it
// from here rather than being handed one, so a search can start before the
// index has landed and simply await it.
let storePromise: Promise<AssemblyStore> | undefined

export function loadStore() {
  storePromise ??= loadJsonOnce<AssemblyIndex>('/ortholog_index.json').then(
    createStore,
  )
  return storePromise
}
