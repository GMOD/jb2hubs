import useSWRImmutable from 'swr/immutable'

import { delay } from '../lib/delay.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import ErrorWithRetry from './ErrorWithRetry.tsx'
import OrthologResultsTable from './OrthologResultsTable.tsx'
import { fetchTaxonAncestors } from './multiSyntenyTaxonTree.ts'
import { ORTHOLOG_SCOPES } from './orthologClades.ts'

import type { GeneIdentity, OrthologSet } from './geneHub.ts'
import type { DrilldownData } from './multiSyntenyDrilldown.ts'
import type { OrthologScope } from './orthologClades.ts'
import type { OrthologResult } from './orthologSearchUtils.ts'

// How long the table waits for the clade lineages before drawing its rows
// ungrouped. It used to draw them flat at once and regroup a second later,
// which moved every row out from under the reader.
const LINEAGE_WAIT_MS = 3000

export default function OrthologSection({
  identity,
  scope,
  onScope,
  orthologs,
  error,
  loading,
  onRetry,
  refResult,
  drilldown,
}: {
  identity: GeneIdentity
  scope: OrthologScope
  onScope: (id: string) => void
  orthologs: OrthologSet | undefined
  error: unknown
  loading: boolean
  onRetry: () => void
  refResult: OrthologResult | undefined
  drilldown: DrilldownData | undefined
}) {
  const { symbol, geneId, refTaxId } = identity
  const results = orthologs?.results
  // Root-to-taxon lineages for the species in this answer, which is what lets
  // the table group its rows by clade: about a second of NCBI. Past
  // LINEAGE_WAIT_MS, or on a failure, the rows are drawn as one flat group and
  // stay that way.
  const { data: lineages, error: lineageError } = useSWRImmutable(
    results && results.length > 0 ? ['lineages', geneId, scope.id] : null,
    () =>
      Promise.race([
        fetchTaxonAncestors((results ?? []).map(r => r.assembly.taxonId)),
        delay(LINEAGE_WAIT_MS).then(() => null),
      ]),
    LIVE_QUERY,
  )
  const grouped = lineages !== undefined || lineageError !== undefined
  const scoped = scope.taxa.length > 0

  return (
    <section className="gene-section">
      <div className="gene-section-head">
        <h2>Orthologs in hosted genomes</h2>
        <label className="gene-scope">
          Limit to{' '}
          <select
            className="ui-select"
            value={scope.id}
            onChange={e => {
              onScope(e.target.value)
            }}
            title="Ask NCBI for orthologs in one clade only — a smaller, faster answer than every species"
          >
            {ORTHOLOG_SCOPES.map(s => (
              <option
                key={s.id}
                value={s.id}
              >
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading && <p className="ui-hint">Fetching orthologs of {symbol}…</p>}
      <ErrorWithRetry
        error={error}
        onRetry={onRetry}
        className="ui-error"
      />
      {orthologs && results && (
        <>
          {orthologs.totalOrthologs > 0 && (
            <p className="orthologs-summary">
              {results.length} of {orthologs.totalOrthologs} NCBI ortholog
              {orthologs.totalOrthologs === 1 ? '' : 's'}
              {scoped ? ` in ${scope.label.toLowerCase()}` : ''} present in our
              collection
            </p>
          )}
          {results.length > 0 && !refResult && scoped && (
            <p className="orthologs-note">
              {identity.species || 'Your reference species'} is outside{' '}
              {scope.label.toLowerCase()}, so these rows have no reference row
              to mark and no synteny links — those compare each ortholog against
              the reference. Search every species to get them back.
            </p>
          )}
          {results.length === 0 ? (
            <p className="ui-hint">
              {orthologs.totalOrthologs > 0
                ? 'NCBI lists orthologs for this gene, but we host none of their genomes'
                : 'NCBI lists no orthologs for this gene'}
              {scoped ? ` within ${scope.label.toLowerCase()}` : ''}.
            </p>
          ) : grouped ? (
            // Remounted per gene and scope, which is what drops the previous
            // answer's filter text, ticks and open clades.
            <OrthologResultsTable
              key={`${geneId}:${refTaxId}:${scope.id}`}
              symbol={symbol}
              results={results}
              refResult={refResult}
              drilldown={drilldown}
              lineages={lineages ?? undefined}
            />
          ) : (
            <p className="ui-hint orthologs-grouping">
              Grouping {results.length} species by clade…
            </p>
          )}
        </>
      )}
    </section>
  )
}
