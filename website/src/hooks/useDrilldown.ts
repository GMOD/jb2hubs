import useSWRImmutable from 'swr/immutable'

import {
  NO_DRILLDOWN,
  loadDrilldownData,
} from '../components/multiSyntenyDrilldown.ts'

// The pair catalog and assembly index behind every synteny link and gene-order
// drill-down, fetched once there is a gene to show them for. SWR retries a
// failed load; meanwhile no gene links anywhere.
export function useDrilldown(enabled: boolean) {
  const { data, error } = useSWRImmutable(
    enabled ? 'gene-drilldown' : null,
    loadDrilldownData,
  )
  return data ?? (error ? NO_DRILLDOWN : undefined)
}
