// Wire format for the hub tables. A category like bacteria has 22K rows, and the
// full processedHubJson record carries ~10 URL fields per row that the table
// never shows — serializing those into the page HTML made /hubs/bacteria a 43MB
// document that rendered nothing until it had all arrived. These are the fields
// the table actually uses, encoded one array per row so the key names aren't
// repeated 22K times. generateHubData.ts is the only writer.

export type HubRow = [
  string, // accession
  string, // commonName
  string, // scientificName
  string, // ncbiAssemblyName
  string, // assemblyStatus
  string, // seqReleaseDate
  number, // taxonId
  string, // submitterOrg
  number, // ncbiStatus
]

export const IS_REFERENCE = 1
export const IS_SUPPRESSED = 2

export interface RowData {
  accession: string
  commonName: string
  scientificName: string
  ncbiAssemblyName: string
  assemblyStatus: string
  seqReleaseDate: string
  taxonId: number
  submitterOrg: string
  // Bitfield of IS_REFERENCE | IS_SUPPRESSED.
  ncbiStatus: number
}

export interface HubSource {
  accession: string
  commonName?: string | null
  scientificName?: string | null
  ncbiAssemblyName?: string | null
  assemblyStatus?: string | null
  seqReleaseDate?: string | null
  taxonId?: number | null
  submitterOrg?: string | null
  ncbiRefSeqCategory?: string | null
  suppressed?: boolean | null
  // The GenArk category the row came from, i.e. which hubData file holds it.
  source?: string | null
}

export function encodeHubRow(source: HubSource): HubRow {
  return [
    source.accession,
    source.commonName ?? '',
    source.scientificName ?? '',
    source.ncbiAssemblyName ?? '',
    source.assemblyStatus ?? '',
    source.seqReleaseDate ?? '',
    source.taxonId ?? 0,
    source.submitterOrg ?? '',
    (source.ncbiRefSeqCategory === 'reference genome' ? IS_REFERENCE : 0) +
      (source.suppressed ? IS_SUPPRESSED : 0),
  ]
}

export function decodeHubRow(row: HubRow): RowData {
  return {
    accession: row[0],
    commonName: row[1],
    scientificName: row[2],
    ncbiAssemblyName: row[3],
    assemblyStatus: row[4],
    seqReleaseDate: row[5],
    taxonId: row[6],
    submitterOrg: row[7],
    ncbiStatus: row[8],
  }
}

// Normalizes a source record into exactly what the client decodes from the wire,
// so a server-rendered first page can't drift from the rows that replace it.
export function toRowData(source: HubSource) {
  return decodeHubRow(encodeHubRow(source))
}

// The table's default order, applied by the generator and by the pages that
// server-render a first page, so what loads over the wire lines up with what was
// already painted instead of reshuffling under the user.
export function byCommonName(a: HubSource, b: HubSource) {
  return (a.commonName ?? '').localeCompare(b.commonName ?? '')
}

// Everything a page hands the hub table. Lives here rather than in the page
// frontmatter because Astro extracts getStaticPaths into its own module and
// tree-shakes the rest of the frontmatter away.
export interface HubTableData {
  // Rendered immediately, so the document has real content without the full set.
  initialRows: RowData[]
  // Compact row files holding the whole set — see generateHubData.ts.
  dataUrls: string[]
  // Set when the table shows a taxonomic subtree rather than a whole category, so
  // the fetched category files get narrowed to it.
  accessions?: string[]
  totalRows: number
}

const FIRST_PAGE = 200

// A whole GenArk category, which has a hubData file of its own.
export function categoryTable(slug: string, rows: HubSource[]): HubTableData {
  const sorted = rows.filter(row => row.accession).sort(byCommonName)
  return {
    initialRows: sorted.slice(0, FIRST_PAGE).map(toRowData),
    dataUrls: [`/hubData/${slug}.json`],
    totalRows: sorted.length,
  }
}

// One taxonomic subtree, which can draw from several categories.
export function subtreeTable(rows: HubSource[]): HubTableData {
  const sorted = rows.filter(row => row.accession).sort(byCommonName)
  const sources = new Set<string>()
  for (const row of sorted) {
    if (row.source) {
      sources.add(row.source)
    }
  }
  return {
    initialRows: sorted.slice(0, FIRST_PAGE).map(toRowData),
    dataUrls: [...sources].map(source => `/hubData/${source}.json`),
    accessions: sorted.map(row => row.accession),
    totalRows: sorted.length,
  }
}
