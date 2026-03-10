export interface UCSCGenArkAssemblyEntry {
  taxId: number
  asmId: string
  genBank: string
  refSeq: string
  identical: string
  sciName: string
  comName: string
  ucscBrowser: string
}

// NCBI Datasets API format (from `datasets summary genome accession`)
export interface NCBIDatasetsReport {
  accession: string
  current_accession: string
  paired_accession?: string
  organism: {
    organism_name: string
    common_name?: string
    tax_id: number
  }
  assembly_info: {
    assembly_level: string
    assembly_name: string
    assembly_status: string
    assembly_type: string
    refseq_category?: string
    release_date: string
    submitter: string
    paired_assembly?: {
      accession: string
      status: string
    }
  }
  assembly_stats: {
    contig_l50: number
    contig_n50: number
    scaffold_l50: number
    scaffold_n50: number
    number_of_contigs: number
    number_of_scaffolds: number
    total_number_of_chromosomes: number
    total_sequence_length: string
    total_ungapped_length: string
    gc_count?: string
    gc_percent?: number
    genome_coverage?: string
    number_of_component_sequences?: number
  }
}

export interface NCBIDatasetsResponse {
  reports: NCBIDatasetsReport[]
  total_count: number
}
