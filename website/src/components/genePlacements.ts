import {
  isAbsentOr,
  isArrayOf,
  isEither,
  isNumber,
  isShape,
  isString,
} from 'hubtools/guards'

import type { AssemblyStore } from './orthologDb.ts'
import type { Guard } from 'hubtools/guards'

// NCBI Datasets gene shape (only the fields we read), shared by the orthologs
// and dataset_report endpoints
interface GenomicLocation {
  genomic_accession_version?: string | null
  sequence_name?: string | null
  genomic_range?: {
    begin?: string | null
    end?: string | null
    orientation?: string | null
  } | null
}
export interface DatasetsGene {
  gene_id?: string | null
  symbol?: string | null
  type?: string | null
  tax_id?: string | number | null
  annotations?:
    | {
        assembly_accession?: string | null
        genomic_locations?: GenomicLocation[] | null
      }[]
    | null
}

export function taxonIdOf(gene: DatasetsGene | null | undefined) {
  return Number(gene?.tax_id ?? NaN)
}

const isGenomicLocation: Guard<GenomicLocation> = isShape({
  genomic_accession_version: isAbsentOr(isString),
  sequence_name: isAbsentOr(isString),
  genomic_range: isAbsentOr(
    isShape({
      begin: isAbsentOr(isString),
      end: isAbsentOr(isString),
      orientation: isAbsentOr(isString),
    }),
  ),
})

export const datasetsGeneShape = {
  gene_id: isAbsentOr(isString),
  symbol: isAbsentOr(isString),
  type: isAbsentOr(isString),
  tax_id: isAbsentOr(isEither(isString, isNumber)),
  annotations: isAbsentOr(
    isArrayOf(
      isShape({
        assembly_accession: isAbsentOr(isString),
        genomic_locations: isAbsentOr(isArrayOf(isGenomicLocation)),
      }),
    ),
  ),
}

const isDatasetsGene: Guard<DatasetsGene> = isShape(datasetsGeneShape)

export const isDatasetsGeneReports = isShape({
  reports: isAbsentOr(isArrayOf(isShape({ gene: isAbsentOr(isDatasetsGene) }))),
})

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
export function placements(gene: DatasetsGene | null | undefined): Placement[] {
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
        sequenceName: l.sequence_name ?? undefined,
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
  gene: DatasetsGene | null | undefined,
  store: AssemblyStore,
) {
  return placements(gene).flatMap(p => {
    const hosted = store.find(p.assembly)
    return hosted ? [{ ...p, hosted }] : []
  })
}
