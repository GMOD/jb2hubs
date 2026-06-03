// [commonName, scientificName, taxonId]
export type OrthologEntry = [string, string, number]
export type OrthologIndex = Record<string, OrthologEntry>

export const COMMON_SPECIES = [
  { label: 'Human', taxId: 9606 },
  { label: 'Mouse', taxId: 10090 },
  { label: 'Rat', taxId: 10116 },
  { label: 'Zebrafish', taxId: 7955 },
  { label: 'Chicken', taxId: 9031 },
  { label: 'Dog', taxId: 9615 },
  { label: 'Cow', taxId: 9913 },
  { label: 'Pig', taxId: 9823 },
  { label: 'Frog (X. tropicalis)', taxId: 8364 },
  { label: 'Fruitfly', taxId: 7227 },
  { label: 'C. elegans', taxId: 6239 },
  { label: 'Yeast (S. cerevisiae)', taxId: 4932 },
  { label: 'Arabidopsis', taxId: 3702 },
]

export const COMMON_TAX_RANK = new Map(
  COMMON_SPECIES.map((s, i) => [s.taxId, i]),
)

export interface NcbiOrthologGene {
  gene_id: string
  symbol: string
  annotations?: {
    assembly_accession: string
    assembly_name: string
    genomic_locations?: {
      genomic_accession_version: string
      sequence_name: string
      genomic_range?: {
        begin: string
        end: string
      }
    }[]
  }[]
}

export interface NcbiOrthologReport {
  gene: NcbiOrthologGene
}

export interface NcbiOrthologResponse {
  reports?: NcbiOrthologReport[]
  total_count?: number
}

export interface OrthologResult {
  accession: string
  commonName: string
  scientificName: string
  geneSymbol: string
  geneId: string
  taxonId: number
  chromosome: string
  begin: number
  end: number
  locStr: string
  jbrowseUrl: string
}

export function accessionToJbrowseUrl(accession: string, loc?: string) {
  const [base = '', rest = ''] = accession.split('_')
  const digits = rest.replace(/\.\d+$/, '')
  const b1 = digits.slice(0, 3)
  const b2 = digits.slice(3, 6)
  const b3 = digits.slice(6, 9)
  const configPath = `${base}/${b1}/${b2}/${b3}/${accession}/config.json`
  const url = `https://jbrowse.org/code/jb2/latest/?config=/hubs/genark/${configPath}`
  if (!loc) {
    return url
  }
  return `${url}&loc=${encodeURIComponent(loc)}`
}

export function accessionBase(accession: string) {
  return accession.replace(/\.\d+$/, '')
}

export const MERGE_API =
  'https://0hifvzakej.execute-api.us-east-1.amazonaws.com/merge'

export function orthoSyntenyUrl(
  refAccession: string,
  r: OrthologResult,
  trackId: string,
) {
  const mergeApiUrl = `${MERGE_API}?hubIds=${r.accession},${refAccession}`
  const sessionSpec = {
    views: [
      {
        type: 'LinearSyntenyView',
        tracks: [trackId],
        views: [
          { assembly: r.accession, loc: r.locStr },
          { assembly: refAccession },
        ],
      },
    ],
  }
  return `https://jbrowse.org/code/jb2/main/?config=${encodeURIComponent(mergeApiUrl)}&session=spec-${encodeURIComponent(JSON.stringify(sessionSpec))}`
}

export type BaseIndex = Map<string, { accession: string; entry: OrthologEntry }>

// NCBI's ortholog API sometimes reports a different assembly *version* than the
// one we host. We key a secondary index on the version-stripped accession so a
// near-version match still links to a config; JBrowse's refName aliasing then
// resolves the genomic accession at navigation time.
export function buildBaseIndex(index: OrthologIndex) {
  const baseIndex: BaseIndex = new Map()
  for (const [accession, entry] of Object.entries(index)) {
    baseIndex.set(accessionBase(accession), { accession, entry })
  }
  return baseIndex
}

export function resolveHit(
  index: OrthologIndex,
  baseIndex: BaseIndex,
  apiAccession: string,
) {
  const direct = index[apiAccession]
  if (direct) {
    return { accession: apiAccession, entry: direct }
  }
  return baseIndex.get(accessionBase(apiAccession))
}

// Display integers with thousands separators. We pin en-US since the build
// must be deterministic and locale-independent.
export function formatNumber(n: number) {
  return n.toLocaleString('en-US')
}

export function buildOrthologResults(
  reports: NcbiOrthologReport[],
  index: OrthologIndex,
) {
  const baseIndex = buildBaseIndex(index)
  const matched: OrthologResult[] = []
  for (const { gene } of reports) {
    for (const ann of gene.annotations ?? []) {
      const hit = resolveHit(index, baseIndex, ann.assembly_accession)
      if (hit) {
        const loc = ann.genomic_locations?.[0]
        if (loc?.genomic_range) {
          const begin = parseInt(loc.genomic_range.begin)
          const end = parseInt(loc.genomic_range.end)
          const locStr = `${loc.genomic_accession_version}:${begin}-${end}`
          matched.push({
            accession: hit.accession,
            commonName: hit.entry[0],
            scientificName: hit.entry[1],
            geneSymbol: gene.symbol,
            geneId: gene.gene_id,
            taxonId: hit.entry[2],
            chromosome: loc.sequence_name,
            begin,
            end,
            locStr,
            jbrowseUrl: accessionToJbrowseUrl(hit.accession, locStr),
          })
          break
        }
      }
    }
  }

  matched.sort((a, b) => {
    const ar = COMMON_TAX_RANK.get(a.taxonId) ?? Infinity
    const br = COMMON_TAX_RANK.get(b.taxonId) ?? Infinity
    if (ar !== br) {
      return ar - br
    }
    return a.scientificName.localeCompare(b.scientificName)
  })
  return matched
}
