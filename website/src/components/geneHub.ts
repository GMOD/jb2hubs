// The data layer of the /gene hub: one resolution of a gene symbol in a
// reference taxon, shared by the identity header, the ortholog table and the
// gene-order figure, plus the pure helpers those sections need.

import { genomeAssemblyName } from '../config/jbrowse.ts'
import { encodeGeneRef } from './geneSearch.ts'
import { fetchOrthologReports } from './ncbiFetch.ts'
import { loadStore } from './orthologDb.ts'
import { buildOrthologResults } from './orthologResults.ts'
import { resolveGeneReport, resolveRefTaxon } from './orthologSet.ts'
import { COMMON_TAX_RANK, knownTaxon } from './referenceSpecies.ts'

import type { NcbiOrthologResponse, OrthologResult } from './orthologResults.ts'
import type { GeneReport } from './orthologSet.ts'

// Curated human example chips: two with vertebrate gene-order rearrangements
// (BRCA1 across sharks/rays, TP53), a signalling gene with orthologs across
// every clade, and two textbook conserved clusters whose neighbors are the rest
// of the cluster — beta-globin and HOXA.
export const EXAMPLES = ['BRCA1', 'TP53', 'SHH', 'HBB', 'HOXA13']

export const HUMAN_TAXON = 9606

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
  ensemblGeneId?: string
  uniprotAccession?: string
}

export function identityFromReport(
  typed: string,
  taxId: number,
  gene: GeneReport,
): GeneIdentity {
  const maps = gene.map_locations ?? []
  return {
    geneId: gene.gene_id ?? typed,
    symbol: gene.symbol ?? typed,
    description: gene.description ?? '',
    mapLocation:
      (maps.find(m => m.map_type === 'Cytogenetic') ?? maps[0])?.map_value ??
      '',
    aliases: gene.synonyms ?? [],
    species: gene.taxname ?? '',
    commonName: gene.common_name ?? '',
    refTaxId: Number(gene.tax_id) || taxId,
    ensemblGeneId: gene.ensembl_gene_ids?.[0],
    uniprotAccession: gene.swiss_prot_accessions?.[0],
  }
}

// Symbol (or numeric GeneID) plus a free-text reference to the gene NCBI
// settles on, following a replaced record to its replacement. Throws when the
// taxon or the gene is unknown; SWR surfaces that as the page's error line.
export async function resolveGeneIdentity(gene: string, ref: string) {
  const taxId = await resolveRefTaxon(ref)
  const report = await resolveGeneReport(gene, taxId)
  if (!report?.gene_id) {
    const typed = gene.trim()
    throw new Error(
      /^\d+$/.test(typed)
        ? `NCBI Gene has no record ${typed}.`
        : `No gene found for "${gene}" in taxon ${taxId}.`,
    )
  }
  return identityFromReport(gene, taxId, report)
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

// The ortholog section's first look: the model organisms in the answer, which
// buildOrthologResults already sorts to the front, filled out from `lead` (the
// reference's own clade) and then the rest when there are few of them. Never
// the reference itself, which the header above already places.
const PREVIEW_ROWS = 8

export function previewOrthologs(
  results: OrthologResult[],
  refAccession: string | undefined,
  lead: OrthologResult[] = results,
) {
  const picked = results
    .filter(
      r =>
        r.assembly.accession !== refAccession &&
        COMMON_TAX_RANK.has(r.assembly.taxonId),
    )
    .slice(0, PREVIEW_ROWS)
  const seen = new Set(picked.map(r => r.assembly.accession))
  for (const r of [...lead, ...results]) {
    if (picked.length >= PREVIEW_ROWS) {
      break
    }
    if (
      r.assembly.accession !== refAccession &&
      !seen.has(r.assembly.accession)
    ) {
      picked.push(r)
    }
  }
  return picked
}

// Whether the preview needs clade lineages: only when the model organisms
// (other than the reference's taxon) do not fill its rows on their own.
export function previewNeedsLineages(
  results: OrthologResult[],
  refTaxId: number,
) {
  return (
    results.filter(
      r =>
        r.assembly.taxonId !== refTaxId &&
        COMMON_TAX_RANK.has(r.assembly.taxonId),
    ).length < PREVIEW_ROWS
  )
}

export function choice(choices: number[], raw: string, fallback: number) {
  const n = Number(raw)
  return choices.includes(n) ? n : fallback
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
    assembly: genomeAssemblyName(assembly),
    gene: encodeGeneRef(geneId, symbol),
  })
  return `/synteny/?${params.toString()}`
}

// Ensembl's cross-site search, for a gene NCBI cross-references to no
// Ensembl id: a symbol search lands on the gene in every Ensembl division.
export function ensemblSearchUrl(symbol: string) {
  return `https://www.ensembl.org/Multi/Search/Results?q=${encodeURIComponent(symbol)};site=ensembl_all`
}

// The gene's own Ensembl page. The stable-id resolver serves the main site's
// ENS… ids; a division's id (Arabidopsis AT1G…) goes through the search.
export function ensemblUrl(identity: {
  symbol: string
  ensemblGeneId?: string
}) {
  const id = identity.ensemblGeneId
  return id?.startsWith('ENS')
    ? `https://www.ensembl.org/id/${encodeURIComponent(id)}`
    : ensemblSearchUrl(id ?? identity.symbol)
}

export function uniprotUrl(accession: string) {
  return `https://www.uniprot.org/uniprotkb/${encodeURIComponent(accession)}/entry`
}
