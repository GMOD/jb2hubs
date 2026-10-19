import type { AssemblyStore } from './orthologDb.ts'

// NCBI Datasets gene shape (only the fields we read), shared by the orthologs
// and dataset_report endpoints
interface GenomicLocation {
  genomic_accession_version?: string
  sequence_name?: string
  genomic_range?: { begin?: string; end?: string; orientation?: string }
}
export interface DatasetsGene {
  gene_id?: string
  symbol?: string
  type?: string
  tax_id?: string | number
  annotations?: {
    assembly_accession?: string
    genomic_locations?: GenomicLocation[]
  }[]
}

export interface Placement {
  // the assembly NCBI annotated, which may be a version we do not host
  assembly: string
  refName: string
  sequenceName?: string
  start: number
  end: number
  strand: 1 | -1
}

// Every location of a gene that has a whole genomic range, in NCBI's order. A
// species annotated on two assemblies (human: GRCh38 and T2T-CHM13) lists both.
export function placements(gene: DatasetsGene | undefined): Placement[] {
  return (gene?.annotations ?? []).flatMap(a =>
    (a.genomic_locations ?? []).flatMap(l => {
      const { begin, end, orientation } = l.genomic_range ?? {}
      if (
        !a.assembly_accession ||
        !l.genomic_accession_version ||
        !begin ||
        !end
      ) {
        return []
      }
      const p: Placement = {
        assembly: a.assembly_accession,
        refName: l.genomic_accession_version,
        sequenceName: l.sequence_name,
        start: Number(begin),
        end: Number(end),
        strand: orientation === 'minus' ? -1 : 1,
      }
      return [p]
    }),
  )
}

// The placements on assemblies we host, with what the store says of each
export function hostedPlacements(
  gene: DatasetsGene | undefined,
  store: AssemblyStore,
) {
  return placements(gene).flatMap(p => {
    const hosted = store.find(p.assembly)
    return hosted ? [{ ...p, hosted }] : []
  })
}
