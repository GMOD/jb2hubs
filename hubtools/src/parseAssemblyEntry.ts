import path from 'path'

import { accessionChunks, readJSON } from './util.ts'

import type {
  NCBIDatasetsReport,
  NCBIDatasetsResponse,
  UCSCGenArkAssemblyEntry,
} from './types.ts'

export function parseAssemblyEntry({
  entry,
}: {
  entry: UCSCGenArkAssemblyEntry
}) {
  const { taxId, asmId, genBank, refSeq, sciName, comName, ucscBrowser } = entry
  const ucscAcc = path.basename(ucscBrowser)
  const accession =
    ucscAcc.startsWith('GCF_') || ucscAcc.startsWith('GCA_')
      ? ucscAcc
      : refSeq || genBank
  const chunks = accessionChunks(accession)
  if (!chunks) {
    console.error(`Unexpected accession format: ${accession}`)
    return undefined
  }
  const { base, b1, b2, b3 } = chunks
  const hubPath = `${base}/${b1}/${b2}/${b3}/${accession}`
  const ucscBase = `https://hgdownload.soe.ucsc.edu/hubs/${hubPath}`

  // Fields common to both the "ncbi.json present" and "ncbi.json missing" cases
  const common = {
    accession,
    assembly: asmId || '',
    scientificName: sciName || '',
    commonName: comName || '',
    // not `taxId || ''`: that widened a numeric field to number|string, which
    // every consumer types as number and guards with `?? 0` — a guard an empty
    // string slips straight through. No current entry has a falsy taxId, so
    // the emitted json is unchanged.
    taxonId: taxId,
    jbrowseLink: `https://jbrowse.org/code/jb2/latest/?config=/hubs/genark/${hubPath}/config.json`,
    jbrowseConfig: `https://jbrowse.org/hubs/genark/${hubPath}/config.json`,
    ncbiGff: `https://ftp.ncbi.nlm.nih.gov/genomes/all/${base}/${b1}/${b2}/${b3}/${asmId}/${asmId}_genomic.gff.gz`,
    ncbiLink: `https://www.ncbi.nlm.nih.gov/assembly/${accession}`,
    ucscDataLink: ucscBase,
    ucscBrowserLink: ucscBrowser,
    igvBrowserLink: `https://igv.org/app/?hubURL=${ucscBase}/hub.txt`,
    ncbiName: asmId,
    ncbiBrowserLink: `https://www.ncbi.nlm.nih.gov/gdv/browser/genome/?id=${accession}`,
  }

  const fn = `hubs/${hubPath}/ncbi.json`
  let report: NCBIDatasetsReport | undefined
  let ncbiDownloadedAt: number | undefined
  try {
    const ncbiData = readJSON<NCBIDatasetsResponse>(fn)
    ncbiDownloadedAt = ncbiData.downloaded_at
    report = ncbiData.reports.find(
      r =>
        r.accession === accession ||
        r.paired_accession === accession ||
        r.current_accession === accession,
    )
    report ??= ncbiData.reports[0]
  } catch {
    console.error(
      `NCBI data not found for ${accession} (${comName}): ${fn} does not exist`,
    )
  }

  if (!report) {
    return {
      ...common,
      stats: undefined,
      seqReleaseDate: undefined,
      submitterOrg: undefined,
      ncbiOrganism: undefined,
      ncbiAssemblyName: undefined,
      ncbiRefSeqCategory: undefined,
      suppressed: false,
      assemblyType: undefined,
      assemblyStatus: undefined,
      pairedAccession: undefined,
      pairedAssemblyStatus: undefined,
      pairedAssemblyDifferences: undefined,
      genomeNotes: undefined,
      suppressionReason: undefined,
      infraspecificNames: undefined,
      comments: undefined,
      gcPercent: undefined,
      genomeCoverage: undefined,
      sequencingTech: undefined,
      bioprojectAccession: undefined,
      annotationInfo: undefined,
      ncbiDownloadedAt: undefined,
      ncbiMissing: true,
    }
  }

  const { assembly_info, assembly_stats, organism, annotation_info } = report
  const ncbiOrganism = organism.common_name
    ? `${organism.organism_name} (${organism.common_name})`
    : organism.organism_name
  // When the report was matched via r.paired_accession === accession, the
  // report describes the other assembly (e.g. GCA report for a GCF hub), so
  // the paired accession is report.accession, not report.paired_accession.
  const pairedAccession =
    report.paired_accession === accession
      ? report.accession
      : (report.paired_accession ?? assembly_info.paired_assembly?.accession)

  return {
    ...common,
    stats: {
      contig_count: assembly_stats.number_of_contigs,
      contig_l50: assembly_stats.contig_l50,
      contig_n50: assembly_stats.contig_n50,
      scaffold_count: assembly_stats.number_of_scaffolds,
      scaffold_l50: assembly_stats.scaffold_l50,
      scaffold_n50: assembly_stats.scaffold_n50,
      chromosome_count: assembly_stats.total_number_of_chromosomes,
      total_length: assembly_stats.total_sequence_length,
      ungapped_length: assembly_stats.total_ungapped_length,
    },
    seqReleaseDate: assembly_info.release_date,
    submitterOrg: assembly_info.submitter,
    ncbiOrganism,
    ncbiAssemblyName: assembly_info.assembly_name,
    ncbiRefSeqCategory: assembly_info.refseq_category,
    suppressed: assembly_info.assembly_status === 'suppressed',
    assemblyType: assembly_info.assembly_type,
    assemblyStatus: assembly_info.assembly_level,
    pairedAccession,
    pairedAssemblyStatus: assembly_info.paired_assembly?.status,
    pairedAssemblyDifferences: assembly_info.paired_assembly?.differences,
    genomeNotes: assembly_info.genome_notes,
    suppressionReason: assembly_info.suppression_reason,
    infraspecificNames: organism.infraspecific_names,
    comments: assembly_info.comments,
    gcPercent: assembly_stats.gc_percent,
    genomeCoverage: assembly_stats.genome_coverage,
    sequencingTech: assembly_info.sequencing_tech,
    bioprojectAccession: assembly_info.bioproject_accession,
    annotationInfo: annotation_info,
    ncbiDownloadedAt,
    ncbiMissing: false,
  }
}
