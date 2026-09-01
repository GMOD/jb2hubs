// The data layer of the /gene hub: one resolution of a gene symbol in a
// reference taxon, shared by the identity header, the ortholog table and the
// gene-order figure, plus the pure helpers those sections need.

import { encodeGeneRef } from './geneSearch.ts'
import { EUTILS, fetchOrthologReports, ncbiJson } from './ncbiFetch.ts'
import { loadStore } from './orthologDb.ts'
import { COMMON_SPECIES, buildOrthologResults } from './orthologSearchUtils.ts'
import { resolveGeneId, resolveRefTaxon } from './orthologSet.ts'

import type { Neighborhood } from './neighborhood.ts'
import type { OrthologScope } from './orthologClades.ts'
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

// Symbol (or numeric GeneID) plus a free-text reference to the gene NCBI
// settles on. Throws when the taxon or the gene is unknown; SWR surfaces that
// as the page's error line.
export async function resolveGeneIdentity(gene: string, ref: string) {
  const taxId = await resolveRefTaxon(ref)
  const geneId = await resolveGeneId(gene, taxId)
  if (!geneId) {
    throw new Error(`No gene found for "${gene}" in taxon ${taxId}.`)
  }
  const res = await ncbiJson<{ result?: Record<string, GeneSummary> }>(
    `${EUTILS}/esummary.fcgi?db=gene&id=${geneId}&retmode=json`,
  )
  return identityFromSummary(gene, taxId, geneId, res.result?.[geneId] ?? {})
}

// The ortholog rows for one resolved gene, restricted to the assemblies we
// host. The assembly index is awaited alongside NCBI, so a query submitted
// before it has landed simply waits.
export async function fetchOrthologSet(geneId: string, scope: OrthologScope) {
  const [store, res] = await Promise.all([
    loadStore(),
    fetchOrthologReports<NcbiOrthologResponse>(geneId, scope.taxa),
  ])
  const reports = res.reports ?? []
  return {
    totalOrthologs: res.total_count ?? reports.length,
    results: buildOrthologResults(reports, store),
  }
}

export type OrthologSet = Awaited<ReturnType<typeof fetchOrthologSet>>

// A reference the page can resolve without a request — a taxon id, or one of
// the suggested species — as the taxon id string; anything else as typed, for
// the fetcher to look up. Keying the fetch on this rather than the raw text is
// what makes `human`, `Human` and `9606` one fetch instead of three.
export function localRef(ref: string) {
  const q = ref.trim()
  const known = COMMON_SPECIES.find(
    s => s.label.toLowerCase() === q.toLowerCase(),
  )
  return /^\d+$/.test(q) ? q : known ? String(known.taxId) : q
}

export function choice(choices: number[], raw: string, fallback: number) {
  const n = Number(raw)
  return choices.includes(n) ? n : fallback
}

// Rows with too few anchors carry little synteny signal and just lengthen the
// figure, so it keeps the most informative species, tree order intact.
const MIN_ANCHORS = 2
const MAX_SPECIES = 80

// When more species qualify than fit, the window is CENTERED on the reference
// rather than taken from the head of the list: tree order runs basal→derived,
// so a head-slice of a human query would be all fish and omit human itself.
// Returns how many species were eligible, so the caller can disclose the cap.
export function trimNeighborhood(nb: Neighborhood) {
  const eligible = nb.species.filter(s => s.genes.length >= MIN_ANCHORS)
  const refIdx = eligible.findIndex(s => s.taxonId === nb.query.refTaxonId)
  const center = refIdx >= 0 ? refIdx : 0
  const start = Math.max(
    0,
    Math.min(
      center - Math.floor(MAX_SPECIES / 2),
      eligible.length - MAX_SPECIES,
    ),
  )
  const species =
    eligible.length <= MAX_SPECIES
      ? eligible
      : eligible.slice(start, start + MAX_SPECIES)
  return { nb: { ...nb, species }, eligible: eligible.length }
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
  return `/synteny?${params.toString()}`
}

// Ensembl's cross-site search: the identity carries no Ensembl id, and a
// symbol search lands on the gene in every Ensembl division.
export function ensemblSearchUrl(symbol: string) {
  return `https://www.ensembl.org/Multi/Search/Results?q=${encodeURIComponent(symbol)};site=ensembl_all`
}
