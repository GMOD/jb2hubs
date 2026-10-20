import { bareCommonName } from 'hubtools/commonName'

import { ncbiGenomeUrl, ncbiTaxonomyUrl } from '../lib/externalLinks.ts'
import { utcDate } from '../lib/utcDate.ts'

import type { AssemblyData, NcbiDetails } from './accessionData.ts'

export type HeadFields = Pick<
  AssemblyData,
  | 'accession'
  | 'scientificName'
  | 'ncbiAssemblyName'
  | 'commonName'
  | 'taxonId'
  | 'seqReleaseDate'
  | 'submitterOrg'
>

// The bare common name, or undefined when it says nothing the scientific name
// does not. GenArk's own repeats the assembly and year, which the page states
// outright, and for 36.8K of 52.8K accessions (2026-09-24) what is left is the
// scientific name again, which read as "Abiotrophia defectiva (Abiotrophia
// defectiva) genome assembly".
export function organismName(commonName: string, scientificName: string) {
  const bare = bareCommonName(commonName)
  return bare && bare.toLowerCase() !== scientificName.toLowerCase()
    ? bare
    : undefined
}

export function speciesLabel(scientificName: string, organism?: string) {
  return organism ? `${scientificName} (${organism})` : scientificName
}

// The accession pages are the site's main entry point from a search engine, so
// each carries a title and description naming its own assembly.
export function accessionHead(data: HeadFields, pageUrl: string) {
  const {
    accession,
    scientificName,
    ncbiAssemblyName,
    taxonId,
    seqReleaseDate,
    submitterOrg,
  } = data
  const organism = organismName(data.commonName, scientificName)
  const assemblyLabel = [ncbiAssemblyName, accession].filter(Boolean).join(' ')
  const title = `${scientificName} — ${assemblyLabel}`
  const description = [
    `${speciesLabel(scientificName, organism)} genome assembly`,
    `${assemblyLabel}.`,
    'Open it in the JBrowse 2 genome browser, see assembly statistics and',
    'annotation, and follow links to NCBI and UCSC.',
  ].join(' ')
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: title,
    description,
    identifier: accession,
    url: pageUrl,
    sameAs: ncbiGenomeUrl(accession),
    ...(seqReleaseDate ? { datePublished: seqReleaseDate } : {}),
    ...(submitterOrg
      ? { creator: { '@type': 'Organization', name: submitterOrg } }
      : {}),
    keywords: [scientificName, organism, accession, ncbiAssemblyName].filter(
      Boolean,
    ),
    about: {
      '@type': 'Taxon',
      name: scientificName,
      ...(organism ? { alternateName: organism } : {}),
      identifier: `NCBI:txid${taxonId}`,
      sameAs: ncbiTaxonomyUrl(taxonId),
    },
  }
  return { organism, title, description, jsonLd }
}

export function specimenSummary(names: Record<string, string> | undefined) {
  const entries = Object.entries(names ?? {})
  return entries.length
    ? entries.map(([key, value]) => `${key}: ${value}`).join(', ')
    : undefined
}

// Whether the "More about this assembly" fold has a row: the provenance and
// raw counts the glance rows leave out
export function hasAssemblyDetails(
  details: NcbiDetails,
  data: Pick<AssemblyData, 'submitterOrg' | 'pairedAccession'>,
) {
  const { stats } = details
  return !!(
    stats?.scaffold_count ||
    stats?.contig_count ||
    details.genomeCoverage ||
    details.sequencingTech ||
    details.bioprojectAccession ||
    specimenSummary(details.infraspecificNames) ||
    data.submitterOrg ||
    data.pairedAccession
  )
}

export function countWithL50(count: number, l50: number | undefined) {
  const n = count.toLocaleString('en-US')
  return l50 ? `${n}, L50 ${l50.toLocaleString('en-US')}` : n
}

// GCA is GenBank, GCF is RefSeq.
export function pairedLabel(pairedAccession: string) {
  return pairedAccession.startsWith('GCF') ? 'Paired RefSeq' : 'Paired GenBank'
}

// The first of `names` the /synteny selector lists. A UCSC-hosted genome is
// listed under its db name (hg38), so the caller puts that ahead of the
// accession.
export function syntenyName(
  names: (string | undefined)[],
  listed: ReadonlySet<string>,
) {
  return names.find(name => name !== undefined && listed.has(name))
}

export function retrievedDate(epochSeconds: number) {
  return utcDate.format(new Date(epochSeconds * 1000))
}
