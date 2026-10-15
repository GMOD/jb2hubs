import useSWRImmutable from 'swr/immutable'

import {
  SINGLE_GENOME_DRILLDOWN,
  loadDrilldownData,
} from '../components/multiSyntenyDrilldown.ts'

// The pair catalog and assembly index behind every synteny link and gene-order
// drill-down, fetched once there is a gene to show them for. A failed catalog
// is an error SWR retries, not an empty index kept until reload; meanwhile
// each gene links to its own genome.
export function useDrilldown(enabled: boolean) {
  const { data, error } = useSWRImmutable(
    enabled ? 'gene-drilldown' : null,
    loadDrilldownData,
  )
  return data ?? (error ? SINGLE_GENOME_DRILLDOWN : undefined)
}
