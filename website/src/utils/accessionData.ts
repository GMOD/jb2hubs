import fs from 'fs'
import path from 'path'

export interface AnnotationInfo {
  name?: string
  provider?: string
  release_date?: string
  stats?: {
    gene_counts?: {
      protein_coding?: number
      non_coding?: number
      pseudogene?: number
      total?: number
    }
  }
}

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

export interface NcbiDetails {
  stats?: Record<string, unknown>
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

let accessionMap: Map<string, AssemblyData> | null = null

export function loadAccessionMap(): Map<string, AssemblyData> {
  accessionMap ??= new Map(
    JSON.parse(
      fs.readFileSync(path.join('processedHubJson', 'all.json'), 'utf-8'),
    )
      .filter((f: AssemblyData) => f.accession)
      .map((f: AssemblyData) => [f.accession, f]),
  )
  return accessionMap
}

export function loadNcbiDetails(accession: string): NcbiDetails {
  const parts = accession.split('_')
  const base = parts[0]!
  const rest = parts[1]!
  const chunks = rest.match(/.{1,3}/g)!
  const ncbiPath = path.join(
    'hubs',
    base,
    chunks[0],
    chunks[1]!,
    chunks[2]!,
    accession,
    'ncbi.json',
  )
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
