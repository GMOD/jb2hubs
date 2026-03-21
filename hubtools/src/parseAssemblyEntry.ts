import path from 'path'

import { readJSON } from './util.ts'

import type { NCBIDatasetsReport, UCSCGenArkAssemblyEntry } from './types.ts'

export function parseAssemblyEntry({
  entry,
}: {
  entry: UCSCGenArkAssemblyEntry
}) {
  const { taxId, asmId, genBank, refSeq, sciName, comName, ucscBrowser } = entry
  const ucscAcc = path.basename(ucscBrowser)
  const accession = ucscAcc.startsWith('GC') ? ucscAcc : refSeq || genBank
  const [base, rest] = accession.split('_')
  const [b1, b2, b3] = rest!.match(/.{1,3}/g)!

  // Read ncbi.json (now in NCBI Datasets API format)
  const fn = `hubs/${base}/${b1}/${b2}/${b3}/${accession}/ncbi.json`
  let report: NCBIDatasetsReport | undefined
  try {
    const ncbiData = readJSON(fn) as { reports: NCBIDatasetsReport[] }
    report = ncbiData.reports?.find(
      r =>
        r.accession === accession ||
        r.paired_accession === accession ||
        r.current_accession === accession,
    )
    // Fallback to first report
    if (!report && ncbiData.reports?.[0]) {
      report = ncbiData.reports[0]
    }
  } catch {
    console.error(
      `NCBI data not found for ${accession} (${comName}): ${fn} does not exist`,
    )
  }

  if (!report) {
    return undefined
  }

  const { assembly_info, assembly_stats, organism, annotation_info } = report
  const assemblyStatus = assembly_info.assembly_level
  const ncbiAssemblyName = assembly_info.assembly_name
  const seqReleaseDate = assembly_info.release_date
  const ncbiOrganism = organism.common_name
    ? `${organism.organism_name} (${organism.common_name})`
    : organism.organism_name
  const submitterOrg = assembly_info.submitter
  const ncbiRefSeqCategory = assembly_info.refseq_category
  const suppressed = assembly_info.assembly_status === 'suppressed'
  const assemblyType = assembly_info.assembly_type
  const pairedAccession =
    report.paired_accession ?? assembly_info.paired_assembly?.accession
  const pairedAssemblyStatus = assembly_info.paired_assembly?.status
  const pairedAssemblyDifferences = assembly_info.paired_assembly?.differences
  const genomeNotes = assembly_info.genome_notes
  const suppressionReason = assembly_info.suppression_reason
  const infraspecificNames = organism.infraspecific_names
  const comments = assembly_info.comments
  const gcPercent = assembly_stats.gc_percent
  const genomeCoverage = assembly_stats.genome_coverage
  const sequencingTech = assembly_info.sequencing_tech
  const bioprojectAccession = assembly_info.bioproject_accession

  const ucscBase = `https://hgdownload.soe.ucsc.edu/hubs/${base}/${b1}/${b2}/${b3}/${accession}`

  const stats: Record<string, unknown> = {
    contig_count: assembly_stats.number_of_contigs,
    contig_l50: assembly_stats.contig_l50,
    contig_n50: assembly_stats.contig_n50,
    scaffold_count: assembly_stats.number_of_scaffolds,
    scaffold_l50: assembly_stats.scaffold_l50,
    scaffold_n50: assembly_stats.scaffold_n50,
    chromosome_count: assembly_stats.total_number_of_chromosomes,
    total_length: assembly_stats.total_sequence_length,
    ungapped_length: assembly_stats.total_ungapped_length,
  }

  // Construct ncbiGff URL
  const ncbiGffUrl = `https://ftp.ncbi.nlm.nih.gov/genomes/all/${base}/${b1}/${b2}/${b3}/${asmId}/${asmId}_genomic.gff.gz`

  return {
    stats,
    seqReleaseDate,
    submitterOrg,
    ncbiOrganism,
    ncbiAssemblyName,
    ncbiRefSeqCategory,
    suppressed,
    assemblyType,
    accession: accession || '',
    assembly: asmId || '',
    scientificName: sciName || '',
    commonName: comName || '',
    taxonId: taxId || '',
    assemblyStatus,
    jbrowseLink: `https://jbrowse.org/code/jb2/latest/?config=/hubs/genark/${base}/${b1}/${b2}/${b3}/${accession}/config.json`,
    jbrowseConfig: `https://jbrowse.org/hubs/genark/${base}/${b1}/${b2}/${b3}/${accession}/config.json`,
    ncbiGff: ncbiGffUrl,
    ncbiLink: `https://www.ncbi.nlm.nih.gov/assembly/${accession}`,
    ucscDataLink: ucscBase,
    ucscBrowserLink: ucscBrowser,
    igvBrowserLink: `https://igv.org/app/?hubURL=${ucscBase}/hub.txt`,
    ncbiName: asmId,
    ncbiBrowserLink: `https://www.ncbi.nlm.nih.gov/gdv/browser/genome/?id=${accession}`,
    pairedAccession,
    pairedAssemblyStatus,
    pairedAssemblyDifferences,
    genomeNotes,
    suppressionReason,
    infraspecificNames,
    comments,
    gcPercent,
    genomeCoverage,
    sequencingTech,
    bioprojectAccession,
    annotationInfo: annotation_info,
  }
}
