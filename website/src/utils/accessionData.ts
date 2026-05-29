import fs from 'fs'
import path from 'path'

import { accessionChunks } from 'hubtools'

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

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function tryAndReadJSON<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
  } catch {
    return null
  }
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

export function buildUcscMapping(accessions: Map<string, AssemblyData>) {
  const list = JSON.parse(
    fs.readFileSync(path.join('src', 'list.json'), 'utf-8'),
  )

  const baseToUcsc = new Map<string, string>()
  for (const [id, genome] of Object.entries(
    list.ucscGenomes as Record<string, { sourceName?: string }>,
  )) {
    const match = genome.sourceName?.match(/GC[AF]_\d+/)
    if (match) {
      baseToUcsc.set(match[0], id)
    }
  }

  const mapping = new Map<string, string>()
  for (const [accession, data] of accessions) {
    const base = accession.replace(/\.\d+$/, '')
    const ucscId = baseToUcsc.get(base)
    if (ucscId) {
      mapping.set(accession, ucscId)
    } else if (data.pairedAccession) {
      const pairedBase = data.pairedAccession.replace(/\.\d+$/, '')
      const pairedUcscId = baseToUcsc.get(pairedBase)
      if (pairedUcscId) {
        mapping.set(accession, pairedUcscId)
      }
    }
  }
  return mapping
}

export function loadNcbiDetails(accession: string): NcbiDetails {
  const chunks = accessionChunks(accession)
  if (!chunks) {
    return {}
  }
  const { base, b1, b2, b3 } = chunks
  const ncbiPath = path.join('hubs', base, b1, b2, b3, accession, 'ncbi.json')
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
