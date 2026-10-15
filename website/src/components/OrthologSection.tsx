import '../styles/gene.css'

import { useMemo } from 'react'

import useSWRImmutable from 'swr/immutable'

import { delay } from '../lib/delay.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import ErrorWithRetry from './ErrorWithRetry.tsx'
import OrthologPreview from './OrthologPreview.tsx'
import OrthologResultsTable from './OrthologResultsTable.tsx'
import { fetchTaxonAncestors } from './multiSyntenyTaxonTree.ts'
import { ORTHOLOG_SCOPES, groupByClade } from './orthologClades.ts'
import { geneUrl } from './orthologSearchUtils.ts'

import type { GeneIdentity, OrthologSet } from './geneHub.ts'
import type { DrilldownData } from './multiSyntenyDrilldown.ts'
import type { OrthologScope } from './orthologClades.ts'
import type { OrthologResult } from './orthologSearchUtils.ts'

// How long the section waits for the clade lineages before drawing its rows
// ungrouped. It used to draw them flat at once and regroup a second later,
// which moved every row out from under the reader.
const LINEAGE_WAIT_MS = 3000

// The orthologs as /gene's preview, a few rows with a link to /orthologs, or
// as /orthologs' full table. onScope, given only on /orthologs, puts the
// clade scope control in the heading.
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
  onScope?: (id: string) => void
  orthologs: OrthologSet | undefined
  error: unknown
  loading: boolean
  onRetry: () => void
  refResult: OrthologResult | undefined
  drilldown: DrilldownData | undefined
}) {
  const { symbol, geneId, refTaxId } = identity
  const results = orthologs?.results
  const full = onScope !== undefined
  // Root-to-taxon lineages for the species in this answer, which is what cuts
  // the rows into clades: about a second of NCBI. Past LINEAGE_WAIT_MS, or on
  // a failure, the rows are drawn as one flat group and stay that way.
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
  const groups = useMemo(
    () =>
      results && lineages
        ? groupByClade(
            results,
            r => r.assembly.taxonId,
            lineages,
            refResult?.assembly.taxonId,
          )
        : [{ label: 'All species', rows: results ?? [] }],
    [results, lineages, refResult],
  )
  const scoped = scope.taxa.length > 0

  return (
    <section className="gene-section">
      <div className="gene-section-head">
        <h2>Orthologs</h2>
        {onScope && (
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
        )}
      </div>
      {loading && <p className="ui-hint">Fetching orthologs of {symbol}…</p>}
      <ErrorWithRetry
        error={error}
        onRetry={onRetry}
        className="ui-error"
      />
      {orthologs && results && (
        <>
          {results.length === 0 ? (
            <p className="ui-hint">
              {orthologs.totalOrthologs > 0
                ? 'NCBI lists orthologs for this gene, but we host none of their genomes'
                : 'NCBI lists no orthologs for this gene'}
              {scoped ? ` within ${scope.label.toLowerCase()}` : ''}.
            </p>
          ) : !grouped ? (
            <p className="ui-hint orthologs-grouping">
              Grouping {results.length} species by clade…
            </p>
          ) : full ? (
            <OrthologResultsTable
              // Remounted per gene and scope, which is what drops the previous
              // answer's filter text, ticks and open clades.
              key={`${geneId}:${refTaxId}:${scope.id}`}
              symbol={symbol}
              results={results}
              refResult={refResult}
              drilldown={drilldown}
              lineages={lineages ?? undefined}
            />
          ) : (
            <OrthologPreview
              results={results}
              refResult={refResult}
              drilldown={drilldown}
              groups={groups}
              allHref={geneUrl('/orthologs/', symbol, refTaxId)}
            />
          )}
        </>
      )}
    </section>
  )
}
