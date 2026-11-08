import { bareCommonName } from 'hubtools/commonName'

import { ncbiGenomeUrl, ncbiTaxonomyUrl } from '../lib/externalLinks.ts'
import { utcDate } from '../lib/utcDate.ts'
import {
  buildSiblingIndex,
  buildUcscMapping,
  loadAccessionMap,
  loadSyntenyAssemblies,
  taxonomyPageIds,
} from './accessionData.ts'

import type {
  AssemblyData,
  NcbiDetails,
  SiblingAssembly,
} from './accessionData.ts'

// The siblings an accession page lists before "see all"
const MAX_SIBLINGS = 8

export interface AccessionPageProps {
  data: AssemblyData
  // the paired GenBank/RefSeq record has a page here too
  pairedHosted: boolean
  ucscDbName?: string
  // the name /synteny lists the assembly under, where it does
  syntenyAssembly?: string
  taxonomyPage: boolean
  siblings: SiblingAssembly[]
  siblingCount: number
  taxonCount: number
}

// One page per hosted accession, with what it shows of the others
export function accessionPagePaths() {
  const accessions = loadAccessionMap()
  const ucscMappings = buildUcscMapping(accessions)
  const siblingIndex = buildSiblingIndex(accessions)
  const syntenyAssemblies = loadSyntenyAssemblies()
  const taxonPages = taxonomyPageIds()
  return [...accessions.entries()]
    .filter(([id]) => !!id)
    .map(([id, data]) => {
      const { siblings = [], taxonCount = 1 } = siblingIndex.get(id) ?? {}
      const ucscDbName = ucscMappings.get(id)
      return {
        params: { id },
        props: {
          data,
          pairedHosted:
            !!data.pairedAccession && accessions.has(data.pairedAccession),
          ucscDbName,
          syntenyAssembly: syntenyName([ucscDbName, id], syntenyAssemblies),
          taxonomyPage: taxonPages.has(String(data.taxonId)),
          siblings: siblings.slice(0, MAX_SIBLINGS),
          siblingCount: siblings.length,
          taxonCount,
        } satisfies AccessionPageProps,
      }
    })
}

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

const row = <K extends string>(
  kind: K,
  label: string,
  value: string | undefined,
) => (value ? [{ kind, label, value }] : [])

// The "More about this assembly" rows, in order; the page shows the
// disclosure only when there is one.
export function moreAboutRows(
  details: NcbiDetails,
  data: Pick<AssemblyData, 'submitterOrg' | 'pairedAccession'>,
  comments: string | undefined,
) {
  const { stats } = details
  return [
    ...row(
      'text',
      'Scaffolds',
      stats?.scaffold_count
        ? countWithL50(stats.scaffold_count, stats.scaffold_l50)
        : undefined,
    ),
    ...row(
      'text',
      'Contigs',
      stats?.contig_count
        ? countWithL50(stats.contig_count, stats.contig_l50)
        : undefined,
    ),
    ...row(
      'text',
      'Coverage',
      details.genomeCoverage ? `${details.genomeCoverage}x` : undefined,
    ),
    ...row('text', 'Sequencing', details.sequencingTech),
    ...row('text', 'Specimen', specimenSummary(details.infraspecificNames)),
    ...row('text', 'Submitter', data.submitterOrg),
    ...row('bioproject', 'BioProject', details.bioprojectAccession),
    ...row(
      'paired',
      data.pairedAccession ? pairedLabel(data.pairedAccession) : '',
      data.pairedAccession,
    ),
    ...row('comments', 'Submitter comments', comments),
  ]
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
