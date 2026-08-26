// Ortholog proteins for a gene from PANTHER — the source that covers the species
// NCBI's ortholog sets leave out. NCBI's sets are vertebrate- and insect-scoped:
// measured 2026-08-25, human TP53 finds 658 orthologs, fly Antp 108 (all
// insects) and yeast CDC28 three (all yeast), so a fly, worm, yeast or plant
// reference gene can never assemble a cross-species panel from NCBI at all.
// PANTHER maps a gene symbol + taxon to a UniProt accession per target genome in
// one call across 144 reference proteomes; UniProt returns the sequences in a
// second. Both hosts send `access-control-allow-origin: *`.
//
// The measurements behind picking PANTHER over OMA, OrthoDB, Ensembl and EggNOG
// are in react-msaview's agent-docs/ideas/ortholog-sources-beyond-ncbi.md; this
// is that prototype, brought over to feed assembleProteinPanel's rows.

const PANTHER = 'https://pantherdb.org/services/oai/pantherdb'
const UNIPROT = 'https://rest.uniprot.org/uniprotkb'

export interface PantherGenome {
  code: string // PANTHER's organism code, e.g. HUMAN
  taxId: number
  name: string // short common name, e.g. fruit_fly
  longName: string // scientific name
}

interface GenomesResponse {
  search?: {
    output?: {
      genomes?: {
        genome?: {
          short_name?: string
          taxon_id?: number
          name?: string
          long_name?: string
        }[]
      }
    }
  }
}

// `supportedgenomes` -> the code<->taxon map every other parse needs, since
// PANTHER names organisms by code alone in ortholog results.
export function parseGenomes(json: unknown): PantherGenome[] {
  const list = (json as GenomesResponse).search?.output?.genomes?.genome ?? []
  return list.flatMap(g =>
    g.short_name && g.taxon_id
      ? [
          {
            code: g.short_name,
            taxId: g.taxon_id,
            name: g.name ?? g.short_name,
            longName: g.long_name ?? g.short_name,
          },
        ]
      : [],
  )
}

export interface PantherHit {
  code: string
  accession: string
  symbol?: string
  // LDO = least diverged ortholog, PANTHER's pick of the one-to-one; O = any
  // other ortholog in a one-to-many or many-to-many family
  type: 'LDO' | 'O'
}

interface Mapping {
  id?: string
  gene?: string
  target_gene?: string
  target_gene_symbol?: string | number
  ortholog?: string
}

interface MatchResponse {
  search?: {
    mapping?: {
      // one object for a single (or empty) match, an array otherwise
      mapped?: Mapping | Mapping[]
      unmapped_ids?: unknown
    }
  }
}

// "HUMAN|HGNC=1773|UniProtKB=P11802" -> { code, accession }
function parseGeneRef(ref: string | undefined) {
  const [code, ...xrefs] = (ref ?? '').split('|')
  const accession = xrefs
    .find(x => x.startsWith('UniProtKB='))
    ?.slice('UniProtKB='.length)
  return code && accession ? { code, accession } : undefined
}

// `matchortho` -> the query's own accession (PANTHER names it in every row) and
// one hit per target gene. An unknown gene comes back under `unmapped_ids`; a
// gene with no ortholog in the target set comes back as a bare `{ id }`.
export function parseMatches(json: unknown): {
  unmapped: boolean
  queryAccession?: string
  hits: PantherHit[]
} {
  const mapping = (json as MatchResponse).search?.mapping
  const mapped = mapping?.mapped
  const rows = Array.isArray(mapped) ? mapped : mapped ? [mapped] : []
  const hits: PantherHit[] = []
  let queryAccession: string | undefined
  for (const row of rows) {
    queryAccession ??= parseGeneRef(row.gene)?.accession
    const target = parseGeneRef(row.target_gene)
    if (target && (row.ortholog === 'LDO' || row.ortholog === 'O')) {
      hits.push({
        ...target,
        symbol:
          row.target_gene_symbol === undefined
            ? undefined
            : String(row.target_gene_symbol),
        type: row.ortholog,
      })
    }
  }
  return { unmapped: !!mapping?.unmapped_ids, queryAccession, hits }
}

// One hit per organism: the LDO where PANTHER named one, else the first other
// ortholog it listed. A many-to-many family (the Hox genes) has no LDO at all,
// so dropping to "first O" is what keeps those species in the panel.
export function pickOnePerGenome(hits: PantherHit[]): PantherHit[] {
  const byCode = new Map<string, PantherHit>()
  for (const hit of hits) {
    const current = byCode.get(hit.code)
    if (!current || (current.type === 'O' && hit.type === 'LDO')) {
      byCode.set(hit.code, hit)
    }
  }
  return [...byCode.values()]
}

interface UniProtResponse {
  results?: {
    primaryAccession?: string
    sequence?: { value?: string }
  }[]
}

// `uniprotkb/accessions` -> accession -> sequence
export function parseSequences(json: unknown): Map<string, string> {
  const map = new Map<string, string>()
  for (const r of (json as UniProtResponse).results ?? []) {
    if (r.primaryAccession && r.sequence?.value) {
      map.set(r.primaryAccession, r.sequence.value)
    }
  }
  return map
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`${new URL(url).host} request failed (${res.status})`)
  }
  return res.json()
}

let genomes: Promise<PantherGenome[]> | undefined

// The reference-proteome list, ~32 KB, read once per page. A failed load is
// evicted so a later gene retries rather than replaying the rejection.
export function fetchGenomes() {
  genomes ??= fetchJson(`${PANTHER}/supportedgenomes`)
    .then(parseGenomes)
    .catch((e: unknown) => {
      genomes = undefined
      throw e
    })
  return genomes
}

// UniProt caps one `accessions` call at 100 ids.
const UNIPROT_CHUNK = 100

async function fetchSequences(accessions: string[]) {
  const map = new Map<string, string>()
  for (let i = 0; i < accessions.length; i += UNIPROT_CHUNK) {
    const chunk = accessions.slice(i, i + UNIPROT_CHUNK)
    const json = await fetchJson(
      `${UNIPROT}/accessions?accessions=${chunk.join(',')}&fields=accession,sequence&format=json`,
    )
    for (const [acc, seq] of parseSequences(json)) {
      map.set(acc, seq)
    }
  }
  return map
}

export interface PantherOrtholog {
  taxId: number
  commonName: string
  scientificName: string
  accession: string // UniProt
  symbol?: string
  sequence: string
}

// The query species first, then one ortholog per target taxon in `taxa` order.
// `symbol` is what PANTHER matches against unless a UniProt accession is known,
// which is unambiguous. Taxa PANTHER has no proteome for are skipped, as are
// hits whose accession UniProt no longer serves.
export async function fetchPantherOrthologs({
  symbol,
  taxId,
  uniprotId,
  taxa,
}: {
  symbol: string
  taxId: number
  uniprotId?: string
  taxa: number[]
}): Promise<PantherOrtholog[]> {
  const all = await fetchGenomes()
  const byTaxId = new Map(all.map(g => [g.taxId, g]))
  const byCode = new Map(all.map(g => [g.code, g]))
  const query = byTaxId.get(taxId)
  if (!query) {
    throw new Error(`PANTHER has no reference proteome for taxon ${taxId}`)
  }
  const targets = taxa.filter(t => t !== taxId && byTaxId.has(t))
  const params = new URLSearchParams({
    geneInputList: uniprotId ?? symbol,
    organism: String(taxId),
    targetOrganism: targets.join(','),
    orthologType: 'all',
  })
  const parsed = parseMatches(
    await fetchJson(`${PANTHER}/ortholog/matchortho?${params}`),
  )
  if (parsed.unmapped) {
    throw new Error(`PANTHER has no entry for ${symbol} in ${query.longName}`)
  }
  const queryAccession = uniprotId ?? parsed.queryAccession
  if (!queryAccession) {
    throw new Error(`PANTHER lists no orthologs for ${symbol}`)
  }
  const rank = new Map(targets.map((t, i) => [t, i]))
  const picks = pickOnePerGenome(parsed.hits)
    .map(hit => ({ hit, genome: byCode.get(hit.code) }))
    .filter(
      (p): p is { hit: PantherHit; genome: PantherGenome } =>
        !!p.genome && rank.has(p.genome.taxId),
    )
    .sort((a, b) => rank.get(a.genome.taxId)! - rank.get(b.genome.taxId)!)

  const sequences = await fetchSequences([
    queryAccession,
    ...picks.map(p => p.hit.accession),
  ])
  const rows = [
    { genome: query, accession: queryAccession, symbol },
    ...picks.map(p => ({
      genome: p.genome,
      accession: p.hit.accession,
      symbol: p.hit.symbol,
    })),
  ]
  return rows.flatMap(row => {
    const sequence = sequences.get(row.accession)
    return sequence
      ? [
          {
            taxId: row.genome.taxId,
            commonName: row.genome.name.replaceAll('_', ' '),
            scientificName: row.genome.longName,
            accession: row.accession,
            symbol: row.symbol,
            sequence,
          },
        ]
      : []
  })
}
