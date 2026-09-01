// The wire format of public/searchIndex.json, shared by the generator that
// writes it (generateSearchIndex.ts), the generators that read it back
// (generateTaxonomyFilter.ts, generateOrthologIndex.ts) and the client. One
// declaration, so a field added here is added everywhere or nowhere.
//
// Framework-free on purpose: the generators run under plain node.
export type IndexEntry = [
  string, // accession (a UCSC db name for source 'ucsc')
  string, // commonName
  string, // scientificName
  string, // assemblyName
  string, // assemblyStatus
  string, // source ('ucsc', or the GenArk category)
  number, // taxonId
  number, // ncbiStatus: bitfield of IS_REFERENCE | IS_SUPPRESSED
  number, // year the assembly was released, 0 if unknown
  number, // UCSC's preference order within the species (1 = first), 0 = unranked
  string, // altAccession: the GC[AF] accession of a UCSC db, '' for GenArk
]

// The ncbiStatus bits, also what the hub tables' rows carry.
export const IS_REFERENCE = 1
export const IS_SUPPRESSED = 2

export function ncbiStatusOf(source: {
  ncbiRefSeqCategory?: string | null
  suppressed?: boolean | null
}) {
  return (
    (source.ncbiRefSeqCategory === 'reference genome' ? IS_REFERENCE : 0) |
    (source.suppressed ? IS_SUPPRESSED : 0)
  )
}

export const SEARCH_INDEX_URL = '/searchIndex.json'
