// NCBI's ortholog report as the table's rows: who each ortholog is, where it
// sits, and the TSV the table downloads.

import { matchesAllTerms, searchTerms } from '../lib/searchTerms.ts'
import { hostedPlacements } from './genePlacements.ts'
import { accessionToJbrowseUrl } from './orthologLaunches.ts'
import { COMMON_TAX_RANK } from './referenceSpecies.ts'

import type { AssemblyStore } from './orthologDb.ts'

// The species identity of one ortholog row: its hosted assembly and NCBI's
// names. `commonName` is missing on ~15% of NCBI rows; the table then shows the
// scientific name alone.
export interface Assembly {
  accession: string
  scientificName: string
  commonName?: string
  taxonId: number
  // UCSC browser db (hg38, mm39, …) for a native UCSC genome; picks the
  // launch's JBrowse config.
  ucscDb?: string
  // the gene track a launch of that UCSC genome opens
  geneTrack?: string
}

interface NcbiGene {
  gene_id: string
  symbol: string
  tax_id?: string | number
  taxname?: string
  common_name?: string
  annotations?: {
    assembly_accession: string
    genomic_locations?: {
      genomic_accession_version: string
      sequence_name: string
      genomic_range?: { begin: string; end: string; orientation?: string }
    }[]
  }[]
}

export interface NcbiOrthologReport {
  gene: NcbiGene
}

export interface NcbiOrthologResponse {
  reports?: NcbiOrthologReport[]
  total_count?: number
}

export interface OrthologResult {
  assembly: Assembly
  // Set when NCBI placed the ortholog on another version of the hosted assembly
  // (see createStore); the coordinates are that version's.
  otherVersion?: string
  geneSymbol: string
  geneId: string
  chromosome: string
  // NCBI's sequence accession (NC_000017.11), which both config kinds resolve
  // through their chromAlias; `chromosome` is a display name
  refName: string
  begin: number
  end: number
  jbrowseUrl: string
  // Strand on its own assembly, from NCBI's `genomic_range.orientation`;
  // decides which panels `strandFlips` flips. Defaults to 1 when NCBI names
  // none.
  strand: 1 | -1
}

// How many times the reference gene's span this row's gene covers.
export function geneSpanRatio(r: OrthologResult, ref: OrthologResult) {
  return (r.end - r.begin + 1) / Math.max(1, ref.end - ref.begin + 1)
}

// NCBI names a scaffold "Unplaced Scaffold" or "25 Unlocalized Scaffold",
// which says nothing about which one, and leaves a few sequences unnamed; the
// accession names it.
export function sequenceLabel(name: string | undefined, accession: string) {
  return name && !/scaffold/i.test(name) ? name : accession
}

// 17:7,668,421–7,687,490 −
const formatNumber = (n: number) => n.toLocaleString('en-US')

export function locusText(
  refName: string,
  start: number,
  end: number,
  strand: number,
) {
  return `${refName}:${formatNumber(start)}–${formatNumber(end)} ${strand > 0 ? '+' : '−'}`
}

// The rows as TSV: tab, not comma, because common names carry commas and no
// field holds a tab. Takes the caller's on-screen rows.
export function orthologsToTsv(results: OrthologResult[]) {
  const header = [
    'scientific_name',
    'common_name',
    'taxon_id',
    'gene_symbol',
    'gene_id',
    'assembly',
    'refname',
    'chromosome',
    'begin',
    'end',
    'strand',
    'jbrowse_url',
  ]
  const rows = results.map(r =>
    [
      r.assembly.scientificName,
      r.assembly.commonName ?? '',
      r.assembly.taxonId,
      r.geneSymbol,
      r.geneId,
      r.assembly.accession,
      r.refName,
      r.chromosome,
      r.begin,
      r.end,
      r.strand > 0 ? '+' : '-',
      r.jbrowseUrl,
    ].join('\t'),
  )
  return [header.join('\t'), ...rows].join('\n')
}

// Free-text row filter over species names, the ortholog's symbol (LOC… when
// uncharacterised) and the accession. Whitespace-separated terms are ANDed.
export function matchesQuery(r: OrthologResult, query: string) {
  return matchesAllTerms(
    [
      r.assembly.scientificName,
      r.assembly.commonName ?? '',
      r.geneSymbol,
      r.assembly.accession,
    ].join(' '),
    searchTerms(query),
  )
}

export function buildOrthologResults(
  reports: NcbiOrthologReport[],
  store: AssemblyStore,
): OrthologResult[] {
  const results: OrthologResult[] = []

  for (const { gene } of reports) {
    // Rows group by clade and match the reference by taxon, so a report without
    // `tax_id` has no place. All 658 TP53 reports carry one.
    const taxonId = Number(gene.tax_id)
    if (!Number.isFinite(taxonId)) {
      continue
    }
    // A placement on the very version we host beats an earlier one that only
    // shares its base accession
    const placed = hostedPlacements(gene, store)
    const hit = placed.find(p => p.hosted.exact) ?? placed[0]
    if (hit) {
      const { hosted, refName, start: begin, end } = hit
      const assembly: Assembly = {
        accession: hosted.accession,
        ucscDb: hosted.ucscDb,
        geneTrack: hosted.geneTrack,
        scientificName: gene.taxname ?? String(taxonId),
        commonName: gene.common_name,
        taxonId,
      }
      results.push({
        assembly,
        ...(hosted.exact ? {} : { otherVersion: hit.assembly }),
        geneSymbol: gene.symbol,
        geneId: gene.gene_id,
        chromosome: sequenceLabel(hit.sequenceName, refName),
        refName,
        begin,
        end,
        strand: hit.strand,
        jbrowseUrl: accessionToJbrowseUrl(assembly, {
          refName,
          start: begin,
          end,
        }),
      })
    }
  }

  return results.sort((a, b) => {
    const ar = COMMON_TAX_RANK.get(a.assembly.taxonId) ?? Infinity
    const br = COMMON_TAX_RANK.get(b.assembly.taxonId) ?? Infinity
    return ar !== br
      ? ar - br
      : a.assembly.scientificName.localeCompare(b.assembly.scientificName)
  })
}
