import {
  isArrayOf,
  isNumber,
  isOptional,
  isRecordOf,
  isShape,
  isString,
  isStringArray,
} from './guards.ts'

import type { Guard } from './guards.ts'
import type { AnnotationInfo, NCBIDatasetsReport } from './types.ts'

const optString = isOptional(isString)
const optNumber = isOptional(isNumber)

export const isAnnotationInfo: Guard<AnnotationInfo> = isShape({
  name: optString,
  provider: optString,
  release_date: optString,
  report_url: optString,
  busco: isOptional(
    isShape({
      busco_lineage: optString,
      busco_ver: optString,
      complete: optNumber,
      single_copy: optNumber,
      duplicated: optNumber,
      fragmented: optNumber,
      missing: optNumber,
      total_count: optString,
    }),
  ),
  stats: isOptional(
    isShape({
      gene_counts: isOptional(
        isShape({
          protein_coding: optNumber,
          non_coding: optNumber,
          pseudogene: optNumber,
          other: optNumber,
          total: optNumber,
        }),
      ),
    }),
  ),
})

export const isNcbiDatasetsReport: Guard<NCBIDatasetsReport> = isShape({
  accession: isString,
  current_accession: isString,
  paired_accession: optString,
  organism: isShape({
    organism_name: isString,
    common_name: optString,
    tax_id: isNumber,
    infraspecific_names: isOptional(isRecordOf(isString)),
  }),
  assembly_info: isShape({
    assembly_level: isString,
    assembly_name: isString,
    assembly_status: isString,
    assembly_type: isString,
    refseq_category: optString,
    release_date: isString,
    submitter: optString,
    bioproject_accession: optString,
    comments: optString,
    genome_notes: isOptional(isStringArray),
    sequencing_tech: optString,
    suppression_reason: optString,
    paired_assembly: isOptional(
      isShape({
        accession: isString,
        status: isString,
        differences: optString,
      }),
    ),
  }),
  assembly_stats: isShape({
    contig_l50: isNumber,
    contig_n50: isNumber,
    scaffold_l50: isNumber,
    scaffold_n50: isNumber,
    number_of_contigs: isNumber,
    number_of_scaffolds: isNumber,
    total_number_of_chromosomes: optNumber,
    total_sequence_length: isString,
    total_ungapped_length: isString,
    gc_count: optString,
    gc_percent: optNumber,
    genome_coverage: optString,
    number_of_component_sequences: optNumber,
  }),
  annotation_info: isOptional(isAnnotationInfo),
})

export const isNcbiDatasetsReports = isArrayOf(isNcbiDatasetsReport)
