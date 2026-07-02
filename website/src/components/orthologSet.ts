// Ortholog rows + name/id helpers for the multi-way synteny view. Pulls a gene's
// orthologs (coords + strand) from one NCBI Datasets call and resolves symbols to
// GeneIDs — no static assembly index, no eutils chaining. Consumed by
// neighborhood.ts (which adds neighbors + the induced tree).

import { DATASETS, EUTILS, ncbiJson } from './ncbiFetch.ts'
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

// First annotation+location carrying a genomic range; undefined for unplaced
// genes (which are skipped).
export function locate(gene: DatasetsGene | undefined) {
  return gene?.annotations
    ?.flatMap(a => (a.genomic_locations ?? []).map(l => ({ a, l })))
    .find(({ l }) => l.genomic_range?.begin)
}

// One row per ortholog gene with coordinates + strand.
function buildRows(reports: { gene?: DatasetsGene }[]): OrthologRow[] {
  const rows: OrthologRow[] = []
  for (const { gene } of reports) {
    const taxonId = Number(gene?.tax_id)
    const hit = locate(gene)
    if (gene?.gene_id && Number.isFinite(taxonId) && hit) {
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
  return rows
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
export async function resolveGeneId(query: string, refTaxonId: number) {
  if (/^\d+$/.test(query.trim())) {
    return query.trim()
  }
  const term = `${encodeURIComponent(query)}[Gene+Name]+AND+${refTaxonId}[taxid]`
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
  const json = await ncbiJson<{ reports?: { gene?: DatasetsGene }[] }>(
    `${DATASETS}/gene/id/${geneId}/orthologs?returned_content=COMPLETE`,
  )
  return buildRows(json.reports ?? [])
}
