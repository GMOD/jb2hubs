import useSWRImmutable from 'swr/immutable'

import {
  fetchOrthologSet,
  fetchReferenceResult,
} from '../components/geneHub.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import { useDrilldown } from './useDrilldown.ts'

import type { GeneIdentity } from '../components/geneHub.ts'
import type { OrthologScope } from '../components/orthologClades.ts'

// A gene's orthologs in the genomes we host, within one clade scope, plus the
// reference species' own row, which a scope that leaves the reference out
// leaves out of the answer too, and the pair catalog behind the synteny links.
export function useOrthologs(
  identity: GeneIdentity | undefined,
  scope: OrthologScope,
) {
  const drilldown = useDrilldown(identity !== undefined)
  const orthologs = useSWRImmutable(
    identity ? ['orthologs', identity.geneId, scope.id] : null,
    ([, geneId]) => fetchOrthologSet(geneId, scope.taxa),
    LIVE_QUERY,
  )
  const inScope = orthologs.data?.results.find(
    r => r.assembly.taxonId === identity?.refTaxId,
  )
  const outOfScope = useSWRImmutable(
    identity && orthologs.data && !inScope && scope.taxa.length > 0
      ? ['reference-row', identity.geneId, identity.refTaxId]
      : null,
    ([, geneId, refTaxId]) => fetchReferenceResult(geneId, refTaxId),
    LIVE_QUERY,
  )
  return {
    orthologs,
    refRow: inScope ?? outOfScope.data,
    refRowError: outOfScope.error as unknown,
    retryRefRow: () => {
      void outOfScope.mutate()
    },
    drilldown,
  }
}
