// Gene-order ("gggenomes-style") synteny model: the query gene plus its genomic
// neighbors (anchors) in the reference, with each anchor's orthologs placed in
// every species. Tree-ordered rows + per-anchor links between rows reveal
// gene-order conservation and rearrangements.
//
// Built entirely from the validated ortholog assembler: one ortholog call per
// anchor gives that anchor's ortholog (coords + strand) in every species, so the
// neighborhood is just "run the assembler for the query gene's neighbors and one
// shared tree over the union of species".

import {
  collectNames,
  fetchOrthologRows,
  locate,
  resolveGeneId,
  type DatasetsGene,
  type OrthologRow,
} from './orthologSet.ts'
import {
  fetchInducedTree,
  leafOrder,
  type TaxonNode,
} from './multiSyntenyTaxonTree.ts'
import { DATASETS, EUTILS, ncbiJson } from './ncbiFetch.ts'

// Reference-genome neighbor gene used as a synteny anchor.
export interface Anchor {
  geneId: string
  symbol: string
  isQuery: boolean
  refStart: number
  refEnd: number
}

// One anchor's ortholog placed in one species.
export interface PlacedGene {
  anchorId: string
  symbol: string
  assembly: string // GCF accession, for click -> JBrowse drill-down
  refName: string // genomic_accession_version (e.g. NC_000017.11)
  chromosome: string // human-friendly sequence name (e.g. 17), for UCSC chr mapping
  start: number
  end: number
  strand: 1 | -1
}

export interface SpeciesRow {
  taxonId: number
  scientificName?: string
  commonName?: string
  genes: PlacedGene[]
}

export interface Neighborhood {
  query: { geneId: string; symbol: string; refTaxonId: number }
  anchors: Anchor[] // reference-position order
  species: SpeciesRow[] // tree order
  tree?: TaxonNode
}

export interface NeighborhoodOptions {
  flankBp?: number // window each side of the query gene (reference bp)
  maxAnchors?: number // cap on neighbor genes (nearest to the query)
}

// A reference-genome gene with type + placement, used to pick protein-coding
// anchors. Pseudogenes / ncRNA / predicted loci have no orthologs and would
// collapse the view to the query gene alone, so only PROTEIN_CODING is kept.
interface GeneReport {
  geneId: string
  symbol: string
  type: string
  start: number
  end: number
}

// GeneIDs whose reference position falls in the window, via NCBI Gene's position
// search (works for any taxon).
async function searchNeighborIds(
  refTaxonId: number,
  chromosome: string,
  start: number,
  end: number,
): Promise<string[]> {
  const term = `${refTaxonId}[taxid]+AND+${chromosome}[chromosome]+AND+${start}:${end}[Base+Position]`
  const url = `${EUTILS}/esearch.fcgi?db=gene&term=${term}&retmode=json&retmax=200`
  const json = await ncbiJson<{ esearchresult?: { idlist?: string[] } }>(url)
  return json.esearchresult?.idlist ?? []
}

// Type + symbol + placement for candidate GeneIDs in one Datasets call.
async function fetchGeneReports(geneIds: string[]): Promise<GeneReport[]> {
  if (geneIds.length === 0) {
    return []
  }
  const json = await ncbiJson<{ reports?: { gene?: DatasetsGene }[] }>(
    `${DATASETS}/gene/id/${geneIds.join(',')}/dataset_report`,
  )
  const reports: GeneReport[] = []
  for (const { gene } of json.reports ?? []) {
    const range = locate(gene)?.l.genomic_range
    if (gene?.gene_id && gene.type && range?.begin && range.end) {
      reports.push({
        geneId: gene.gene_id,
        symbol: gene.symbol ?? gene.gene_id,
        type: gene.type,
        start: Number(range.begin),
        end: Number(range.end),
      })
    }
  }
  return reports
}

export async function assembleNeighborhood(
  query: string,
  refTaxonId: number,
  { flankBp = 150_000, maxAnchors = 11 }: NeighborhoodOptions = {},
): Promise<Neighborhood> {
  const queryGeneId = await resolveGeneId(query, refTaxonId)
  if (!queryGeneId) {
    throw new Error(`no gene found for "${query}"`)
  }
  const queryRows = await fetchOrthologRows(queryGeneId)
  const queryRef = queryRows.find(r => r.taxonId === refTaxonId)
  if (!queryRef) {
    throw new Error(`no reference placement for "${query}" in taxon ${refTaxonId}`)
  }

  const neighborIds = await searchNeighborIds(
    refTaxonId,
    queryRef.chromosome,
    queryRef.start - flankBp,
    queryRef.end + flankBp,
  )
  const queryMid = (queryRef.start + queryRef.end) / 2
  const candidates = await fetchGeneReports(
    neighborIds.filter(id => id !== queryGeneId),
  )
  const neighbors = candidates
    .filter(g => g.type === 'PROTEIN_CODING')
    .sort(
      (a, b) =>
        Math.abs((a.start + a.end) / 2 - queryMid) -
        Math.abs((b.start + b.end) / 2 - queryMid),
    )
    .slice(0, maxAnchors - 1)

  // Anchor rows: the query gene (rows already fetched) + each neighbor.
  const neighborRows = await Promise.all(
    neighbors.map(n => fetchOrthologRows(n.geneId)),
  )

  const anchors: Anchor[] = [
    {
      geneId: queryGeneId,
      symbol: queryRef.symbol,
      isQuery: true,
      refStart: queryRef.start,
      refEnd: queryRef.end,
    },
    ...neighbors.map(n => ({
      geneId: n.geneId,
      symbol: n.symbol,
      isQuery: false,
      refStart: n.start,
      refEnd: n.end,
    })),
  ].sort((a, b) => a.refStart - b.refStart)

  // Gather every species seen across all anchors, build one induced tree.
  const allRows = [queryRows, ...neighborRows]
  const taxa = [...new Set(allRows.flat().map(r => r.taxonId))]
  const tree = await fetchInducedTree(taxa)

  const rowsByAnchor = new Map<string, OrthologRow[]>([
    [queryGeneId, queryRows],
    ...neighbors.map(
      (n, i): [string, OrthologRow[]] => [n.geneId, neighborRows[i] ?? []],
    ),
  ])

  // Place each anchor's ortholog into per-species rows, keyed by taxon.
  const byTaxon = new Map<number, SpeciesRow>()
  function rowFor(taxonId: number) {
    let row = byTaxon.get(taxonId)
    if (!row) {
      row = { taxonId, genes: [] }
      byTaxon.set(taxonId, row)
    }
    return row
  }
  for (const anchor of anchors) {
    for (const r of rowsByAnchor.get(anchor.geneId) ?? []) {
      rowFor(r.taxonId).genes.push({
        anchorId: anchor.geneId,
        symbol: r.symbol,
        assembly: r.assembly,
        refName: r.refName,
        chromosome: r.chromosome,
        start: r.start,
        end: r.end,
        strand: r.strand,
      })
    }
  }

  // Order rows by the tree (O(1) rank lookup, not indexOf-in-comparator); taxa
  // absent from the tree sort to the end. Names are attached in the same pass.
  const names = collectNames(tree)
  const order = tree ? leafOrder(tree) : taxa
  const rank = new Map(order.map((t, i) => [t, i]))
  const species = [...byTaxon.values()]
    .sort(
      (a, b) =>
        (rank.get(a.taxonId) ?? order.length) -
        (rank.get(b.taxonId) ?? order.length),
    )
    .map(row => {
      const name = names.get(row.taxonId)
      row.scientificName = name?.scientificName
      row.commonName = name?.commonName
      return row
    })

  return {
    query: { geneId: queryGeneId, symbol: queryRef.symbol, refTaxonId },
    anchors,
    species,
    tree,
  }
}
