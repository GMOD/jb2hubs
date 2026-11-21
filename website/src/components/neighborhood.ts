// Gene-order ("gggenomes-style") synteny model: the query gene plus its genomic
// neighbors (anchors) in the reference, with each anchor's orthologs placed in
// every species. Tree-ordered rows + per-anchor links between rows reveal
// gene-order conservation and rearrangements.
//
// Built entirely from the validated ortholog assembler: one ortholog call per
// anchor gives that anchor's ortholog (coords + strand) in every species, so the
// neighborhood is just "run the assembler for the query gene's neighbors and one
// shared tree over the union of species".

import { checked } from 'hubtools/guards'

import { fetchCodingExtents } from './codingExtent.ts'
import {
  type DatasetsGene,
  type Placement,
  isDatasetsGeneReports,
  placements,
} from './genePlacements.ts'
import {
  type TaxonNode,
  fetchInducedTree,
  leafOrder,
} from './multiSyntenyTaxonTree.ts'
import { DATASETS, EUTILS, ncbiJson } from './ncbiFetch.ts'
import {
  type OrthologRow,
  collectNames,
  fetchOrthologRows,
  isEsearch,
  oneAssemblyPerSpecies,
  resolveGeneId,
} from './orthologSet.ts'

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

// The only values a request may carry, shared by the form that offers them and
// the Lambda that refuses anything else: each extra anchor is one more NCBI
// call, so the vocabulary is the request budget. maxAnchors counts the query
// gene; flankBp is the search window each side of it.
export const ANCHOR_CHOICES = [7, 11, 15, 21]
export const FLANK_CHOICES_BP = [100_000, 150_000, 300_000, 500_000]
export const DEFAULT_MAX_ANCHORS = 11
export const DEFAULT_FLANK_BP = 150_000

// A reference-genome gene as Datasets reports it, before the neighbours are
// picked from the candidates.
interface GeneReport {
  geneId: string
  symbol: string
  type: string
  description: string
  placements: Placement[]
}

interface Neighbour {
  geneId: string
  symbol: string
  start: number
  end: number
}

// Where Gene's position search looks: the chromosome by name, or the sequence
// by accession, since Gene can name a chromosome from a newer assembly than
// the one it gives positions on. Chinese hamster Tp53 is "7" there but placed
// on scaffold NW_003613643.1 of CHO-K1. Datasets calls such a scaffold
// "Unplaced Scaffold", a name the search does not know, and searching it drew a
// quarter of the species in TP53's set as the query alone.
export function searchPlace(sequenceName: string, refName: string) {
  return /^unplaced/i.test(sequenceName)
    ? `${refName}[All+Fields]`
    : `(${sequenceName}[chromosome]+OR+${refName}[All+Fields])`
}

// GeneIDs whose reference position falls in the window, via NCBI Gene's position
// search (works for any taxon). TNF's ±500 kb window holds 239.
async function searchNeighborIds(
  refTaxonId: number,
  place: string,
  start: number,
  end: number,
): Promise<string[]> {
  const term = `${refTaxonId}[taxid]+AND+${place}+AND+${start}:${end}[Base+Position]`
  const url = `${EUTILS}/esearch.fcgi?db=gene&term=${term}&retmode=json&retmax=1000`
  const json = checked(await ncbiJson(url), isEsearch, url)
  return json.esearchresult?.idlist ?? []
}

// Datasets answers 20 reports a page unless asked for more, and the 20 come in
// search order, so an unpaged call drew 6 of HBB's 11 neighbours. A url holding
// 200 GeneIDs stays near 2 kB.
const IDS_PER_REPORT_CALL = 200

async function fetchReportPages(geneIds: string[], pageToken?: string) {
  const url = `${DATASETS}/gene/id/${geneIds.join(',')}/dataset_report?page_size=1000${pageToken ? `&page_token=${pageToken}` : ''}`
  const json = checked(await ncbiJson(url), isDatasetsGeneReports, url)
  const genes = (json.reports ?? []).flatMap(r => (r.gene ? [r.gene] : []))
  const next: DatasetsGene[] = json.next_page_token
    ? await fetchReportPages(geneIds, json.next_page_token)
    : []
  return [...genes, ...next]
}

async function fetchGeneReports(geneIds: string[]): Promise<GeneReport[]> {
  const chunks = Array.from(
    { length: Math.ceil(geneIds.length / IDS_PER_REPORT_CALL) },
    (_, i) =>
      geneIds.slice(i * IDS_PER_REPORT_CALL, (i + 1) * IDS_PER_REPORT_CALL),
  )
  const genes: DatasetsGene[] = []
  for (const chunk of chunks) {
    genes.push(...(await fetchReportPages(chunk)))
  }
  return genes.flatMap(gene =>
    gene.gene_id && gene.type
      ? [
          {
            geneId: gene.gene_id,
            symbol: gene.symbol ?? gene.gene_id,
            type: gene.type,
            description: gene.description ?? '',
            placements: placements(gene),
          },
        ]
      : [],
  )
}

// The query's nearest protein-coding neighbours on its own reference sequence.
// Three kinds of candidate are left out: a gene placed elsewhere (another
// unplaced scaffold, or only another assembly); a readthrough locus such as
// PTGES3L-AARSD1, which NCBI types as protein-coding but which has orthologs in
// almost no species; and the query itself, which the search can return twice,
// since an old GeneID merged into it (646021, now NF1) resolves to the query.
export function nearestNeighbours(
  reports: GeneReport[],
  query: { geneId: string; refName: string; start: number; end: number },
  count: number,
): Neighbour[] {
  const queryMid = (query.start + query.end) / 2
  const byId = new Map<string, Neighbour>()
  for (const r of reports) {
    const placement = r.placements.find(p => p.refName === query.refName)
    if (
      placement &&
      r.geneId !== query.geneId &&
      r.type === 'PROTEIN_CODING' &&
      !/\breadthrough\b/i.test(r.description)
    ) {
      byId.set(r.geneId, {
        geneId: r.geneId,
        symbol: r.symbol,
        start: placement.start,
        end: placement.end,
      })
    }
  }
  return [...byId.values()]
    .toSorted(
      (a, b) =>
        Math.abs((a.start + a.end) / 2 - queryMid) -
        Math.abs((b.start + b.end) / 2 - queryMid),
    )
    .slice(0, count)
}

// NCBI's gene span runs from its first transcript's start to its last one's
// end, so one transcript with a far-off UTR exon spreads a 939 bp ORF over
// 165 kb (human OR51B5). An ortholog more than twice its anchor's median span
// is redrawn over its coding exons; asking for every ortholog's transcripts
// would add ten Datasets calls to TP53's build.
export function longOutliers(rows: OrthologRow[]) {
  const spans = rows.map(r => r.end - r.start).toSorted((a, b) => a - b)
  const median = spans[Math.floor(spans.length / 2)] ?? 0
  return rows.filter(r => r.end - r.start > 2 * median)
}

export async function assembleNeighborhood(
  query: string,
  refTaxonId: number,
  {
    flankBp = DEFAULT_FLANK_BP,
    maxAnchors = DEFAULT_MAX_ANCHORS,
  }: NeighborhoodOptions = {},
): Promise<Neighborhood> {
  const queryGeneId = await resolveGeneId(query, refTaxonId)
  if (!queryGeneId) {
    throw new Error(`no gene found for "${query}"`)
  }
  const queryRows = await fetchOrthologRows(queryGeneId)
  const queryRef = queryRows.find(r => r.taxonId === refTaxonId)
  if (!queryRef) {
    throw new Error(
      `no reference placement for "${query}" in taxon ${refTaxonId}`,
    )
  }

  const neighborIds = await searchNeighborIds(
    refTaxonId,
    searchPlace(queryRef.chromosome, queryRef.refName),
    // Clamped to 1 (coordinates are 1-based): a gene within flankBp of the
    // chromosome start would otherwise ask NCBI for a negative Base Position,
    // which matches nothing and leaves the view with the query gene alone.
    Math.max(1, queryRef.start - flankBp),
    queryRef.end + flankBp,
  )
  const candidates = await fetchGeneReports(neighborIds)
  // The window holds the query, so a search that misses it has failed (a
  // sequence name the search does not know), and its one-gene answer would be
  // cached as though the gene had no neighbours.
  if (!candidates.some(c => c.geneId === queryGeneId)) {
    throw new Error(
      `NCBI's position search for ${queryRef.symbol} on ${queryRef.chromosome} did not find ${queryRef.symbol} itself`,
    )
  }
  const neighbors = nearestNeighbours(
    candidates,
    { ...queryRef, geneId: queryGeneId },
    maxAnchors - 1,
  )

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
  ].toSorted((a, b) => a.refStart - b.refStart)

  // Gather every species seen across all anchors, build one induced tree.
  const allRows = [queryRows, ...neighborRows]
  const taxa = [...new Set(allRows.flat().map(r => r.taxonId))]
  const tree = await fetchInducedTree(taxa)

  const rowsByAnchor = oneAssemblyPerSpecies(
    new Map<string, OrthologRow[]>([
      [queryGeneId, queryRows],
      ...neighbors.map((n, i): [string, OrthologRow[]] => [
        n.geneId,
        neighborRows[i] ?? [],
      ]),
    ]),
    queryGeneId,
  )

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
  const coding = await fetchCodingExtents(
    new Map(
      anchors
        .flatMap(a => longOutliers(rowsByAnchor.get(a.geneId) ?? []))
        .map(r => [r.geneId, r.refName]),
    ),
  )
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
        ...coding.get(r.geneId),
      })
    }
  }

  // Order rows by the tree (O(1) rank lookup, not indexOf-in-comparator); taxa
  // absent from the tree sort to the end. Names are attached in the same pass.
  const names = collectNames(tree)
  const order = tree ? leafOrder(tree) : taxa
  const rank = new Map(order.map((t, i) => [t, i]))
  const species = [...byTaxon.values()]
    .toSorted(
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
