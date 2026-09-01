// Ortholog rows + name/id helpers for the multi-way synteny view. Pulls a gene's
// orthologs (coords + strand) from one NCBI Datasets call and resolves symbols to
// GeneIDs — no static assembly index, no eutils chaining. Consumed by
// neighborhood.ts (which adds neighbors + the induced tree).

import {
  DATASETS,
  EUTILS,
  fetchOrthologReports,
  ncbiJson,
} from './ncbiFetch.ts'
import { COMMON_SPECIES } from './orthologSearchUtils.ts'

import type { TaxonNode } from './multiSyntenyTaxonTree.ts'

export interface OrthologRow {
  taxonId: number
  assembly: string // GCF accession
  symbol: string
  geneId: string
  refName: string // genomic_accession_version, e.g. NC_000017.11
  chromosome: string // human-friendly sequence name, e.g. 17
  start: number // 1-based
  end: number
  strand: 1 | -1
  scientificName?: string
  commonName?: string
}

// NCBI Datasets gene shape (only the fields we read); shared by the orthologs and
// dataset_report endpoints.
interface GenomicLocation {
  genomic_accession_version?: string
  sequence_name?: string
  genomic_range?: { begin?: string; end?: string; orientation?: string }
}
export interface DatasetsGene {
  gene_id?: string
  symbol?: string
  type?: string
  tax_id?: string | number
  annotations?: {
    assembly_accession?: string
    genomic_locations?: GenomicLocation[]
  }[]
}

// Every annotation+location carrying a genomic range, in NCBI's order. A
// species annotated on two assemblies (human: GRCh38 and T2T-CHM13) lists both.
function locateAll(gene: DatasetsGene | undefined) {
  return (gene?.annotations ?? [])
    .flatMap(a => (a.genomic_locations ?? []).map(l => ({ a, l })))
    .filter(({ l }) => l.genomic_range?.begin)
}

// First annotation+location carrying a genomic range; undefined for unplaced
// genes (which are skipped).
export function locate(gene: DatasetsGene | undefined) {
  return locateAll(gene)[0]
}

// One row per placement of each ortholog gene, so a species annotated on two
// assemblies yields two rows for the same gene; oneAssemblyPerSpecies picks
// between them once every anchor's rows are in.
export function buildRows(reports: { gene?: DatasetsGene }[]): OrthologRow[] {
  const rows: OrthologRow[] = []
  for (const { gene } of reports) {
    const taxonId = Number(gene?.tax_id)
    if (gene?.gene_id && Number.isFinite(taxonId)) {
      for (const hit of locateAll(gene)) {
        const { begin, end, orientation } = hit.l.genomic_range ?? {}
        rows.push({
          taxonId,
          assembly: hit.a.assembly_accession ?? '',
          symbol: gene.symbol ?? gene.gene_id,
          geneId: gene.gene_id,
          refName: hit.l.genomic_accession_version ?? '',
          chromosome:
            hit.l.sequence_name ?? hit.l.genomic_accession_version ?? '',
          start: Number(begin),
          end: Number(end),
          strand: orientation === 'minus' ? -1 : 1,
        })
      }
    }
  }
  return rows
}

// Keep one assembly per species across every anchor, so a row's coordinates
// all come from the same genome. Taking the first placement per gene
// independently per anchor let a species annotated on two assemblies mix them
// in one row (1 of 873 BRCA1 rows, measured 2026-09-01), and a JBrowse launch
// built from such a row navigates one assembly with another's coordinates.
//
// The assembly is the one carrying the species' query ortholog (its first
// placement, which is also what the reference locus is read from); a species
// without the query ortholog keeps the assembly most of its anchors are placed
// on. The assembler has no hosted-assembly index to consult, so "the one we
// host" is not an option here. Within the chosen assembly, one placement per
// anchor: a second location is an alt locus or patch, not a second gene.
export function oneAssemblyPerSpecies(
  rowsByAnchor: Map<string, OrthologRow[]>,
  queryAnchorId: string,
) {
  const chosen = new Map<number, string>()
  for (const r of rowsByAnchor.get(queryAnchorId) ?? []) {
    if (!chosen.has(r.taxonId)) {
      chosen.set(r.taxonId, r.assembly)
    }
  }
  const votes = new Map<number, Map<string, number>>()
  for (const rows of rowsByAnchor.values()) {
    for (const r of rows) {
      if (!chosen.has(r.taxonId)) {
        const tally = votes.get(r.taxonId) ?? new Map<string, number>()
        tally.set(r.assembly, (tally.get(r.assembly) ?? 0) + 1)
        votes.set(r.taxonId, tally)
      }
    }
  }
  for (const [taxonId, tally] of votes) {
    let best: [string, number] | undefined
    for (const entry of tally) {
      best = best && best[1] >= entry[1] ? best : entry
    }
    if (best) {
      chosen.set(taxonId, best[0])
    }
  }
  return new Map(
    [...rowsByAnchor].map(([anchorId, rows]): [string, OrthologRow[]] => {
      const seen = new Set<number>()
      return [
        anchorId,
        rows.filter(r => {
          const keep =
            chosen.get(r.taxonId) === r.assembly && !seen.has(r.taxonId)
          if (keep) {
            seen.add(r.taxonId)
          }
          return keep
        }),
      ]
    }),
  )
}

// taxonId -> display names, harvested from every node of the induced tree.
export function collectNames(tree: TaxonNode | undefined) {
  const names = new Map<
    number,
    { scientificName: string; commonName?: string }
  >()
  function walk(node: TaxonNode) {
    names.set(node.taxonId, {
      scientificName: node.name,
      commonName: node.commonName,
    })
    node.children.forEach(walk)
  }
  if (tree) {
    walk(tree)
  }
  return names
}

// Resolve a gene symbol to an NCBI GeneID in the reference taxon (a numeric query
// is already a GeneID).
//
// Both NCBI symbol lookups match aliases as well as symbols, and neither ranks
// the exact match first: `TTN` in human returns 7276 (TTR, transthyretin) ahead
// of 7273 (TTN, titin), on the Datasets symbol endpoint and on an esearch
// `[Gene Name]` alike. Taking the first hit therefore silently resolved titin to
// transthyretin — measured 2026-08-26, and TTN is one of the example chips. So
// ask for the candidates and prefer the one whose own symbol matches.
//
// Falling back to the first hit is what keeps an alias working: `p53` returns
// TP53 and matches nothing exactly, which is the right answer.
export function pickBySymbol(
  query: string,
  candidates: { gene_id?: string; symbol?: string }[],
) {
  const wanted = query.trim().toLowerCase()
  const exact = candidates.find(c => c.symbol?.toLowerCase() === wanted)
  return (exact ?? candidates[0])?.gene_id
}

export async function resolveGeneId(query: string, refTaxonId: number) {
  const trimmed = query.trim()
  if (/^\d+$/.test(trimmed)) {
    return trimmed
  }
  const bySymbol = await ncbiJson<{
    reports?: { gene?: { gene_id?: string; symbol?: string } }[]
  }>(
    `${DATASETS}/gene/symbol/${encodeURIComponent(trimmed)}/taxon/${refTaxonId}`,
  ).catch(() => undefined)
  const hit = pickBySymbol(
    trimmed,
    (bySymbol?.reports ?? [])
      .map(r => r.gene)
      .filter((g): g is { gene_id?: string; symbol?: string } => !!g),
  )
  if (hit) {
    return hit
  }
  // Datasets knows symbols and aliases; esearch also reaches descriptions, so it
  // stays as the wider net for a query neither matches.
  const term = `${encodeURIComponent(trimmed)}[Gene+Name]+AND+${refTaxonId}[taxid]`
  const json = await ncbiJson<{ esearchresult?: { idlist?: string[] } }>(
    `${EUTILS}/esearch.fcgi?db=gene&term=${term}&retmode=json&retmax=1`,
  )
  return json.esearchresult?.idlist?.[0]
}

// Resolve a free-text reference — a numeric taxon id, a common-species label, or
// any scientific/common name — to an NCBI taxon id, so the reference organism is
// not limited to a fixed dropdown. Common species resolve locally (no request);
// anything else goes through NCBI taxonomy search.
export async function resolveRefTaxon(input: string): Promise<number> {
  const q = input.trim()
  const known = COMMON_SPECIES.find(
    s => s.label.toLowerCase() === q.toLowerCase(),
  )
  if (/^\d+$/.test(q)) {
    return Number(q)
  }
  if (known) {
    return known.taxId
  }
  const json = await ncbiJson<{ esearchresult?: { idlist?: string[] } }>(
    `${EUTILS}/esearch.fcgi?db=taxonomy&term=${encodeURIComponent(q)}&retmode=json&retmax=1`,
  )
  const id = json.esearchresult?.idlist?.[0]
  if (!id) {
    throw new Error(`no NCBI taxon found for "${input}"`)
  }
  return Number(id)
}

// One ortholog gene per species, with coordinates + strand, in a single Datasets
// call. No tree (callers fetch one shared tree over the union of species).
export async function fetchOrthologRows(
  geneId: string,
): Promise<OrthologRow[]> {
  const json = await fetchOrthologReports<{
    reports?: { gene?: DatasetsGene }[]
  }>(geneId)
  return buildRows(json.reports ?? [])
}
