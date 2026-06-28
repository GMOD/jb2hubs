// Host-agnostic assembler for the multi-way synteny view: a gene -> the set of
// its orthologs across species, each with genomic coordinates + strand, plus the
// induced taxonomy tree that orders them. Uses only `fetch`, so the exact same
// code runs in a serverless function (which caches the result as a static file)
// or directly in the browser as a dev fallback.
//
// Everything the view needs is in the NCBI Datasets orthologs response itself
// (tax id, assembly, coordinates, strand) — no static assembly index and no
// eutils chaining. Display names are filled from the taxonomy tree nodes.

import { fetchInducedTree, type TaxonNode } from './multiSyntenyTaxonTree.ts'
import { ncbiFetch } from './ncbiFetch.ts'

const DATASETS = 'https://api.ncbi.nlm.nih.gov/datasets/v2'
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

export interface OrthologRow {
  taxonId: number
  assembly: string // GCF accession
  symbol: string
  geneId: string
  refName: string // genomic_accession_version, e.g. NC_000017.11
  chromosome: string // human-friendly sequence name
  start: number // 1-based
  end: number
  strand: 1 | -1
  scientificName?: string
  commonName?: string
}

export interface OrthologSet {
  gene: { geneId: string; symbol: string; refTaxonId: number }
  rows: OrthologRow[]
  tree?: TaxonNode
}

// NCBI Datasets orthologs response (only the fields we read)
interface GenomicLocation {
  genomic_accession_version?: string
  sequence_name?: string
  genomic_range?: { begin?: string; end?: string; orientation?: string }
}
interface Annotation {
  assembly_accession?: string
  genomic_locations?: GenomicLocation[]
}
interface OrthologGene {
  gene_id?: string
  symbol?: string
  tax_id?: string | number
  annotations?: Annotation[]
}
interface OrthologResponse {
  reports?: { gene?: OrthologGene }[]
  total_count?: number
}

function strandOf(orientation: string | undefined): 1 | -1 {
  return orientation === 'minus' ? -1 : 1
}

// One row per ortholog gene, taken from its first annotation that carries a
// genomic range. Genes with no usable location (unplaced) are skipped.
function buildRows(reports: { gene?: OrthologGene }[]): OrthologRow[] {
  const rows: OrthologRow[] = []
  for (const { gene } of reports) {
    const taxonId = gene?.tax_id === undefined ? NaN : Number(gene.tax_id)
    const located = gene?.annotations?.find(a =>
      a.genomic_locations?.some(l => l.genomic_range?.begin),
    )
    const loc = located?.genomic_locations?.find(l => l.genomic_range?.begin)
    if (gene?.gene_id && Number.isFinite(taxonId) && located && loc) {
      const range = loc.genomic_range
      rows.push({
        taxonId,
        assembly: located.assembly_accession ?? '',
        symbol: gene.symbol ?? gene.gene_id,
        geneId: gene.gene_id,
        refName: loc.genomic_accession_version ?? '',
        chromosome: loc.sequence_name ?? loc.genomic_accession_version ?? '',
        start: Number(range?.begin),
        end: Number(range?.end),
        strand: strandOf(range?.orientation),
      })
    }
  }
  return rows
}

// taxonId -> display names, harvested from every node of the induced tree.
export function collectNames(tree: TaxonNode | undefined) {
  const names = new Map<number, { scientificName: string; commonName?: string }>()
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

// Resolve a gene symbol to an NCBI GeneID in the reference taxon. A numeric
// query is treated as a GeneID directly.
export async function resolveGeneId(
  query: string,
  refTaxonId: number,
): Promise<string | undefined> {
  if (/^\d+$/.test(query.trim())) {
    return query.trim()
  }
  const term = `${encodeURIComponent(query)}[Gene+Name]+AND+${refTaxonId}[taxid]`
  const url = `${EUTILS}/esearch.fcgi?db=gene&term=${term}&retmode=json&retmax=1`
  const res = await ncbiFetch(url)
  if (!res.ok) {
    throw new Error(`gene lookup failed (${res.status})`)
  }
  const json = (await res.json()) as {
    esearchresult?: { idlist?: string[] }
  }
  return json.esearchresult?.idlist?.[0]
}

// One ortholog gene per species, with coordinates + strand, in a single Datasets
// call. No tree (callers that need many genes fetch one shared tree over the
// union of species rather than one per gene).
export async function fetchOrthologRows(
  geneId: string,
): Promise<OrthologRow[]> {
  const url = `${DATASETS}/gene/id/${geneId}/orthologs?returned_content=COMPLETE`
  const res = await ncbiFetch(url)
  if (!res.ok) {
    throw new Error(`orthologs request failed (${res.status})`)
  }
  const json = (await res.json()) as OrthologResponse
  return buildRows(json.reports ?? [])
}

// Fill scientificName/commonName onto rows from the induced tree's nodes.
export function fillNames(rows: OrthologRow[], tree: TaxonNode | undefined) {
  const names = collectNames(tree)
  for (const row of rows) {
    const name = names.get(row.taxonId)
    row.scientificName = name?.scientificName
    row.commonName = name?.commonName
  }
}

// Assemble the full ortholog set for a resolved GeneID: orthologs + coordinates,
// then the induced tree, then names merged onto the rows.
export async function assembleOrthologSet(
  geneId: string,
  refTaxonId: number,
): Promise<OrthologSet> {
  const rows = await fetchOrthologRows(geneId)
  const tree = await fetchInducedTree(rows.map(r => r.taxonId))
  fillNames(rows, tree)
  const refSymbol = rows.find(r => r.taxonId === refTaxonId)?.symbol ?? geneId
  return {
    gene: { geneId, symbol: refSymbol, refTaxonId },
    rows,
    tree,
  }
}
