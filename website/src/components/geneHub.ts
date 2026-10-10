// The data layer of the /gene hub: one resolution of a gene symbol in a
// reference taxon, shared by the identity header, the ortholog table and the
// gene-order figure, plus the pure helpers those sections need.

import { encodeGeneRef } from './geneSearch.ts'
import { leafOrder } from './multiSyntenyTaxonTree.ts'
import { EUTILS, fetchOrthologReports, ncbiJson } from './ncbiFetch.ts'
import { loadStore } from './orthologDb.ts'
import {
  COMMON_TAX_RANK,
  buildOrthologResults,
  knownTaxon,
} from './orthologSearchUtils.ts'
import { resolveGeneId, resolveRefTaxon } from './orthologSet.ts'

import type { TaxonNode } from './multiSyntenyTaxonTree.ts'
import type { Neighborhood } from './neighborhood.ts'
import type { NcbiOrthologResponse } from './orthologSearchUtils.ts'

// Curated human example chips: two with vertebrate gene-order rearrangements
// (BRCA1 across sharks/rays, TP53), a signalling gene with orthologs across
// every clade, and two textbook conserved clusters whose neighbors are the rest
// of the cluster — beta-globin and HOXA.
export const EXAMPLES = ['BRCA1', 'TP53', 'SHH', 'HBB', 'HOXA13']

export const HUMAN_TAXON = 9606

// What NCBI's gene summary says about the query gene itself; the description
// and alias list are what turn a bare symbol into something a reader can
// confirm they searched for the right gene.
export interface GeneSummary {
  name?: string
  description?: string
  maplocation?: string
  otheraliases?: string
  organism?: { scientificname?: string; commonname?: string; taxid?: number }
  error?: string
  currentid?: number | string
}

export interface GeneIdentity {
  geneId: string
  symbol: string
  description: string
  mapLocation: string
  aliases: string[]
  species: string
  commonName: string
  // The gene's OWN organism, not the one that was typed. A numeric GeneID names
  // one gene in one species outright, so a search for 12189 with the box left
  // on Human is a mouse search — and calling human the reference would mark the
  // wrong row and window every launch against the wrong genome.
  refTaxId: number
}

export function identityFromSummary(
  typed: string,
  taxId: number,
  geneId: string,
  summary: GeneSummary,
): GeneIdentity {
  return {
    geneId,
    symbol: summary.name ?? typed,
    description: summary.description ?? '',
    mapLocation: summary.maplocation ?? '',
    aliases: (summary.otheraliases ?? '')
      .split(',')
      .map(a => a.trim())
      .filter(Boolean),
    species: summary.organism?.scientificname ?? '',
    commonName: summary.organism?.commonname ?? '',
    refTaxId: summary.organism?.taxid ?? taxId,
  }
}

// The GeneID NCBI replaced this record with (LOC102724788 is now 5625, PRODH),
// or undefined for a live record, whose `currentid` is ''.
export function replacementOf(summary: GeneSummary | undefined) {
  const id = String(summary?.currentid ?? '')
  return /^[1-9]\d*$/.test(id) ? id : undefined
}

// An id NCBI does not know still gets a summary, `{ uid, error: "cannot get
// document summary" }`, and the page built a gene card out of it: the typed
// number as the symbol, and nothing else.
export function checkedSummary(
  geneId: string,
  summary: GeneSummary | undefined,
) {
  if (!summary?.name || summary.error) {
    throw new Error(
      `NCBI Gene has no record ${geneId}${summary?.error ? ` (${summary.error})` : ''}.`,
    )
  }
  return summary
}

async function fetchGeneSummary(geneId: string) {
  const res = await ncbiJson<{ result?: Record<string, GeneSummary> }>(
    `${EUTILS}/esummary.fcgi?db=gene&id=${geneId}&retmode=json`,
  )
  return res.result?.[geneId]
}

// Symbol (or numeric GeneID) plus a free-text reference to the gene NCBI
// settles on, following a replaced record to its replacement. Throws when the
// taxon or the gene is unknown; SWR surfaces that as the page's error line.
export async function resolveGeneIdentity(gene: string, ref: string) {
  const taxId = await resolveRefTaxon(ref)
  const resolved = await resolveGeneId(gene, taxId)
  if (!resolved) {
    throw new Error(`No gene found for "${gene}" in taxon ${taxId}.`)
  }
  const first = await fetchGeneSummary(resolved)
  const replacement = replacementOf(first)
  const geneId = replacement ?? resolved
  const summary = replacement ? await fetchGeneSummary(replacement) : first
  return identityFromSummary(
    gene,
    taxId,
    geneId,
    checkedSummary(geneId, summary),
  )
}

// The ortholog rows for one resolved gene within the clades `taxa` names (every
// species when empty), restricted to the assemblies we host. The assembly index
// is awaited alongside NCBI, so a query submitted before it has landed simply
// waits.
export async function fetchOrthologSet(geneId: string, taxa: number[]) {
  const [store, res] = await Promise.all([
    loadStore(),
    fetchOrthologReports<NcbiOrthologResponse>(geneId, taxa),
  ])
  const reports = res.reports ?? []
  return {
    totalOrthologs: res.total_count ?? reports.length,
    results: buildOrthologResults(reports, store),
  }
}

export type OrthologSet = Awaited<ReturnType<typeof fetchOrthologSet>>

// The reference gene's own row, for when the table's clade scope leaves its
// species out: NCBI's ortholog set of a gene scoped to the gene's own taxon is
// the gene alone, which names the genome a launch opens on.
export async function fetchReferenceResult(geneId: string, refTaxId: number) {
  const { results } = await fetchOrthologSet(geneId, [refTaxId])
  return results.find(r => r.geneId === geneId)
}

// A reference the page can resolve without a request (knownTaxon) as the taxon
// id string; anything else as typed, for the fetcher to look up. Keying the
// fetch on this rather than the raw text is what makes `human`, `Homo sapiens`
// and `9606` one fetch instead of three.
export function localRef(ref: string) {
  const known = knownTaxon(ref)
  return known === undefined ? ref.trim() : String(known)
}

export function choice(choices: number[], raw: string, fallback: number) {
  const n = Number(raw)
  return choices.includes(n) ? n : fallback
}

// Rows with too few anchors carry little synteny signal and just lengthen the
// figure, so it keeps the most informative species, tree order intact.
const MIN_ANCHORS = 2
export const MAX_SPECIES = 80

// The species outside each successively larger clade around the reference,
// innermost first: for human, the other Homininae, then the orangutans, the
// gibbons, the Old World monkeys, and so on out to the root. A species the tree
// does not place lands in a last ring of its own.
export function kinshipRings(tree: TaxonNode | undefined, refTaxonId: number) {
  const path: TaxonNode[] = []
  function find(node: TaxonNode): boolean {
    path.push(node)
    if (
      node.taxonId === refTaxonId ||
      node.children.some(c => find(c))
    ) {
      return true
    }
    path.pop()
    return false
  }
  const rings: number[][] = []
  if (tree && find(tree)) {
    const seen = new Set([refTaxonId])
    for (const ancestor of [...path].reverse().slice(1)) {
      const ring = leafOrder(ancestor).filter(t => !seen.has(t))
      ring.forEach(t => seen.add(t))
      rings.push(ring)
    }
  } else if (tree) {
    rings.push(leafOrder(tree))
  }
  return rings
}

// `quota` items of `items`, the model organisms first and the rest spread
// evenly through the list, which is tree order: an even spread samples every
// sub-clade of the ring rather than the head of one.
function sample(items: number[], quota: number) {
  const models = items.filter(t => COMMON_TAX_RANK.has(t)).slice(0, quota)
  const rest = items.filter(t => !COMMON_TAX_RANK.has(t))
  const n = Math.min(rest.length, quota - models.length)
  return [
    ...models,
    ...Array.from(
      { length: n },
      (_, j) => rest[Math.floor(((j + 0.5) * rest.length) / n)]!,
    ),
  ]
}

// When more species qualify than fit, every ring around the reference gets a
// fair share of the rows, innermost first, and a ring too small for its share
// passes the rest outward. So the figure keeps the reference's closest
// relatives and still reaches the model organisms and the far clades. A slice
// of the tree-ordered list around the reference, which this replaced, opened a
// human TP53 figure on ten newts and caecilians and left out mouse, dog,
// chicken and zebrafish. Returns how many species were eligible, so the caller
// can disclose the cap.
export function trimNeighborhood(nb: Neighborhood, max = MAX_SPECIES) {
  const eligible = nb.species.filter(s => s.genes.length >= MIN_ANCHORS)
  if (eligible.length <= max) {
    return { nb: { ...nb, species: eligible }, eligible: eligible.length }
  }
  const refTaxonId = nb.query.refTaxonId
  const present = new Set(eligible.map(s => s.taxonId))
  const placedInTree = new Set(nb.tree ? leafOrder(nb.tree) : [])
  const rings = [
    ...kinshipRings(nb.tree, refTaxonId),
    eligible.map(s => s.taxonId).filter(t => !placedInTree.has(t)),
  ]
    .map(ring => ring.filter(t => present.has(t) && t !== refTaxonId))
    .filter(ring => ring.length > 0)
  const kept = new Set(present.has(refTaxonId) ? [refTaxonId] : [])
  let budget = max - kept.size
  // Fair shares first, then a second pass hands what small rings left over to
  // the rings nearest the reference.
  const shares = rings.map((ring, i) => {
    const share = Math.min(ring.length, Math.ceil(budget / (rings.length - i)))
    budget -= share
    return share
  })
  rings.forEach((ring, i) => {
    const share = shares[i] ?? 0
    const more = Math.min(ring.length - share, budget)
    budget -= more
    sample(ring, share + more).forEach(t => kept.add(t))
  })
  return {
    nb: { ...nb, species: eligible.filter(s => kept.has(s.taxonId)) },
    eligible: eligible.length,
  }
}

// The /synteny launcher, opened on the reference genome with the gene already
// picked. The catalog knows a UCSC-native genome by its db name (hg38), not
// its accession, so that is the id it gets.
export function syntenyLaunchUrl(
  assembly: { accession: string; ucscDb?: string },
  geneId: string,
  symbol: string,
) {
  const params = new URLSearchParams({
    assembly: assembly.ucscDb ?? assembly.accession,
    gene: encodeGeneRef(geneId, symbol),
  })
  return `/synteny/?${params.toString()}`
}

// Ensembl's cross-site search: the identity carries no Ensembl id, and a
// symbol search lands on the gene in every Ensembl division.
export function ensemblSearchUrl(symbol: string) {
  return `https://www.ensembl.org/Multi/Search/Results?q=${encodeURIComponent(symbol)};site=ensembl_all`
}
