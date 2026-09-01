import fs from 'fs'
import path from 'path'

import { accessionChunks } from 'hubtools'

import { taxonIdsIn } from './taxonomyCache.ts'

import type { AnnotationInfo } from 'hubtools'

export type { AnnotationInfo }

export interface AssemblyData {
  accession: string
  scientificName: string
  ncbiAssemblyName: string
  commonName: string
  jbrowseLink: string
  jbrowseConfig: string
  igvBrowserLink: string
  ncbiBrowserLink: string
  ucscBrowserLink: string
  ucscDataLink: string
  ncbiLink: string
  ncbiGff: string
  ncbiName: string
  assembly: string
  taxonId: number
  source: string
  seqReleaseDate?: string
  assemblyStatus?: string
  assemblyType?: string
  submitterOrg?: string
  suppressed?: boolean
  ncbiRefSeqCategory?: string
  ncbiOrganism?: string
  pairedAccession?: string
  ncbiMissing?: boolean
  [key: string]: unknown
}

export interface AssemblyStats {
  total_length?: number
  ungapped_length?: number
  chromosome_count?: number
  scaffold_count?: number
  scaffold_n50?: number
  scaffold_l50?: number
  contig_count?: number
  contig_n50?: number
  contig_l50?: number
}

export interface NcbiDetails {
  stats?: AssemblyStats
  annotationInfo?: AnnotationInfo
  infraspecificNames?: Record<string, string>
  comments?: string
  gcPercent?: number
  genomeCoverage?: string
  sequencingTech?: string
  bioprojectAccession?: string
  pairedAssemblyStatus?: string
  pairedAssemblyDifferences?: string
  genomeNotes?: string[]
  suppressionReason?: string
  ncbiDownloadedAt?: number
}

export function tryAndReadJSON<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
  } catch {
    return null
  }
}

// The generated hub tree sits at the repo root, one level above the website
// package Astro builds from — so every read of it is '../hubs', not 'hubs'.
// Sharded by the accession's digits: hubs/GCF/000/001/405/GCF_000001405.40/.
function hubFile(accession: string, file: string) {
  const chunks = accessionChunks(accession)
  return chunks
    ? path.join(
        '..',
        'hubs',
        chunks.base,
        chunks.b1,
        chunks.b2,
        chunks.b3,
        accession,
        file,
      )
    : undefined
}

// The GenArk assembly gallery image, scraped alongside the hub. The scraped
// pageUrl holds the article title verbatim, spaces and all
// ("https://wikipedia.org/wiki/Homo sapiens"), so it is encoded here rather than
// emitted into 50K pages as a malformed href.
export function loadHubImage(accession: string) {
  const file = hubFile(accession, 'image.json')
  const image = file
    ? tryAndReadJSON<{ imageUrl?: string; pageUrl?: string }>(file)
    : null
  return image?.pageUrl
    ? { ...image, pageUrl: encodeURI(image.pageUrl) }
    : image
}

export function loadAccessionMap() {
  return new Map<string, AssemblyData>(
    (
      JSON.parse(
        fs.readFileSync(path.join('processedHubJson', 'all.json'), 'utf-8'),
      ) as AssemblyData[]
    )
      .filter(f => f.accession)
      .map(f => [f.accession, f]),
  )
}

// Which UCSC browser db an assembly accession is, from the accessions UCSC's own
// genome list spells out in each entry's sourceName.
//
// The version is load-bearing and used not to be. Nine accession bases are
// claimed by more than one UCSC assembly — GCA_000002035 is danRer7 (Zv9),
// danRer10 AND danRer11 (GRCz11); GCA_000001405 is both hg19 and hg38 — so a
// version-stripped key collapsed them and kept whichever iterated last. That is
// not a near-miss: it named danRer7 for a GRCz11 accession, and a launch built
// on it opened Zv9 coordinates for a GRCz11 locus, silently and plausibly. So
// match the full accession first, and keep a base map only as the fallback for
// an accession whose exact version UCSC does not list, resolved to the newest
// claimant rather than to iteration order.
function accessionVersion(accession: string) {
  const m = /\.(\d+)$/.exec(accession)
  return m ? Number(m[1]) : 0
}

// One entry of list.json's ucscGenomes, as much of it as the pages read.
export interface UcscGenomeEntry {
  description: string
  organism: string
  scientificName: string
  sourceName?: string
  taxId: number
}

function loadUcscGenomes() {
  return (
    JSON.parse(fs.readFileSync(path.join('src', 'list.json'), 'utf-8')) as {
      ucscGenomes: Record<string, UcscGenomeEntry>
    }
  ).ucscGenomes
}

export function buildUcscMapping(accessions: Map<string, AssemblyData>) {
  const exactToUcsc = new Map<string, string>()
  const newestForBase = new Map<string, { id: string; version: number }>()
  for (const [id, genome] of Object.entries(loadUcscGenomes())) {
    const accession = genome.sourceName?.match(/GC[AF]_\d+(?:\.\d+)?/)?.[0]
    if (accession) {
      const version = accessionVersion(accession)
      exactToUcsc.set(accession, id)
      const base = accession.replace(/\.\d+$/, '')
      const incumbent = newestForBase.get(base)
      if (!incumbent || version > incumbent.version) {
        newestForBase.set(base, { id, version })
      }
    }
  }

  const mapping = new Map<string, string>()
  for (const [accession, data] of accessions) {
    const candidates = [accession, data.pairedAccession].filter(
      (a): a is string => !!a,
    )
    const ucscId =
      candidates.map(a => exactToUcsc.get(a)).find(Boolean) ??
      candidates
        .map(a => newestForBase.get(a.replace(/\.\d+$/, ''))?.id)
        .find(Boolean)
    if (ucscId) {
      mapping.set(accession, ucscId)
    }
  }
  return mapping
}

// What /ucsc/<db> links out to: the hosted GenArk accessions the db maps to
// (the reverse of buildUcscMapping, so a link is only ever to a page that
// exists) and whether the taxonomy tree has a page for its taxon.
export function ucscPageLinks() {
  const accessionsByDb = new Map<string, string[]>()
  for (const [accession, db] of buildUcscMapping(loadAccessionMap())) {
    accessionsByDb.set(db, [...(accessionsByDb.get(db) ?? []), accession])
  }
  // Absent on a checkout that has not run generate-taxonomy; the taxonomy
  // pages are absent then too, so nothing links to them.
  const newick = path.join('public', 'taxonomy', 'all.newick')
  const taxonPages = fs.existsSync(newick)
    ? taxonIdsIn(fs.readFileSync(newick, 'utf-8'))
    : new Set<string>()
  return Object.fromEntries(
    Object.entries(loadUcscGenomes()).map(([db, genome]) => [
      db,
      {
        genome,
        accessions: (accessionsByDb.get(db) ?? []).sort(),
        taxonomyPage: taxonPages.has(String(genome.taxId)),
      },
    ]),
  )
}

// What the accession page's "other assemblies for this species" table needs,
// trimmed because it ships as props on 50K pages.
export interface SiblingAssembly {
  accession: string
  ncbiAssemblyName: string
  assemblyStatus: string
  seqReleaseDate: string
  isReference: boolean
  suppressed: boolean
}

function toSibling(data: AssemblyData): SiblingAssembly {
  return {
    accession: data.accession,
    ncbiAssemblyName: data.ncbiAssemblyName,
    assemblyStatus: data.assemblyStatus ?? '',
    seqReleaseDate: data.seqReleaseDate ?? '',
    isReference: data.ncbiRefSeqCategory === 'reference genome',
    suppressed: !!data.suppressed,
  }
}

// Reference genome first, then unsuppressed, then newest, so the top row is the
// one to use.
function bySuitability(a: SiblingAssembly, b: SiblingAssembly) {
  return (
    Number(b.isReference) - Number(a.isReference) ||
    Number(a.suppressed) - Number(b.suppressed) ||
    b.seqReleaseDate.localeCompare(a.seqReleaseDate)
  )
}

export interface SiblingEntry {
  siblings: SiblingAssembly[]
  // Every assembly we host for the taxon, this one included — what the "see all"
  // link leads to. Not siblings.length + 1: a paired GenBank/RefSeq record is
  // left out of the siblings but is still a row on the taxonomy page.
  taxonCount: number
}

// 2.7K of the 42K taxa we host have more than one assembly, and choosing between
// them is exactly the question an accession page should answer. Maps each
// accession to the other assemblies of the same taxon, best first. The paired
// GenBank/RefSeq record is excluded — the page already links that separately.
export function buildSiblingIndex(accessions: Map<string, AssemblyData>) {
  const byTaxon = new Map<number, AssemblyData[]>()
  for (const data of accessions.values()) {
    const group = byTaxon.get(data.taxonId) ?? []
    group.push(data)
    byTaxon.set(data.taxonId, group)
  }

  const index = new Map<string, SiblingEntry>()
  for (const [accession, data] of accessions) {
    const group = byTaxon.get(data.taxonId) ?? []
    index.set(accession, {
      siblings: group
        .filter(
          other =>
            other.accession !== accession &&
            other.accession !== data.pairedAccession,
        )
        .map(toSibling)
        .sort(bySuitability),
      taxonCount: group.length,
    })
  }
  return index
}

export function loadNcbiDetails(accession: string): NcbiDetails {
  const ncbiPath = hubFile(accession, 'ncbi.json')
  if (!ncbiPath) {
    return {}
  }
  const raw = tryAndReadJSON<{
    reports?: {
      assembly_info?: {
        paired_assembly?: { status?: string; differences?: string }
        genome_notes?: string[]
        suppression_reason?: string
        comments?: string
        sequencing_tech?: string
        bioproject_accession?: string
      }
      assembly_stats?: {
        gc_percent?: number
        genome_coverage?: string
        number_of_contigs?: number
        contig_l50?: number
        contig_n50?: number
        number_of_scaffolds?: number
        scaffold_l50?: number
        scaffold_n50?: number
        total_number_of_chromosomes?: number
        total_sequence_length?: number
        total_ungapped_length?: number
      }
      organism?: { infraspecific_names?: Record<string, string> }
      annotation_info?: AnnotationInfo
    }[]
    downloaded_at?: number
  }>(ncbiPath)
  if (!raw?.reports?.[0]) {
    return {}
  }
  const r = raw.reports[0]
  const ai = r.assembly_info ?? {}
  const as_ = r.assembly_stats ?? {}
  return {
    stats: {
      contig_count: as_.number_of_contigs,
      contig_l50: as_.contig_l50,
      contig_n50: as_.contig_n50,
      scaffold_count: as_.number_of_scaffolds,
      scaffold_l50: as_.scaffold_l50,
      scaffold_n50: as_.scaffold_n50,
      chromosome_count: as_.total_number_of_chromosomes,
      total_length: as_.total_sequence_length,
      ungapped_length: as_.total_ungapped_length,
    },
    annotationInfo: r.annotation_info,
    infraspecificNames: r.organism?.infraspecific_names,
    comments: ai.comments,
    gcPercent: as_.gc_percent,
    genomeCoverage: as_.genome_coverage,
    sequencingTech: ai.sequencing_tech,
    bioprojectAccession: ai.bioproject_accession,
    pairedAssemblyStatus: ai.paired_assembly?.status,
    pairedAssemblyDifferences: ai.paired_assembly?.differences,
    genomeNotes: ai.genome_notes,
    suppressionReason: ai.suppression_reason,
    ncbiDownloadedAt: raw.downloaded_at,
  }
}
