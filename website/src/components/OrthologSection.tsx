import '../styles/gene.css'

import useSWRImmutable from 'swr/immutable'

import { delay } from '../lib/delay.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import ErrorWithRetry from './ErrorWithRetry.tsx'
import OrthologPreview from './OrthologPreview.tsx'
import OrthologResultsTable from './OrthologResultsTable.tsx'
import { previewNeedsLineages } from './geneHub.ts'
import { fetchTaxonAncestors } from './multiSyntenyTaxonTree.ts'
import { ORTHOLOG_SCOPES } from './orthologClades.ts'
import { geneUrl } from './orthologSearchUtils.ts'

import type { GeneIdentity, OrthologSet } from './geneHub.ts'
import type { DrilldownData } from './multiSyntenyDrilldown.ts'
import type { OrthologScope } from './orthologClades.ts'
import type { OrthologResult } from './orthologSearchUtils.ts'

// How long the section waits for the clade lineages before drawing its rows
// ungrouped. It used to draw them flat at once and regroup a second later,
// which moved every row out from under the reader.
const LINEAGE_WAIT_MS = 3000

// /gene's preview, a few rows with a link to /orthologs, or /orthologs' full
// table with its clade scope control.
export type OrthologSectionMode =
  | { view: 'preview' }
  | { view: 'all'; onScope: (id: string) => void }

export default function OrthologSection({
  identity,
  scope,
  mode,
  orthologs,
  error,
  loading,
  onRetry,
  refResult,
  refError,
  onRetryRef,
  drilldown,
}: {
  identity: GeneIdentity
  scope: OrthologScope
  mode: OrthologSectionMode
  orthologs: OrthologSet | undefined
  error: unknown
  loading: boolean
  onRetry: () => void
  refResult: OrthologResult | undefined
  refError: unknown
  onRetryRef: () => void
  drilldown: DrilldownData | undefined
}) {
  const { symbol, geneId, refTaxId } = identity
  const results = orthologs?.results
  // Root-to-taxon lineages for the species in this answer, which is what cuts
  // the rows into clades: about a second of NCBI. Past LINEAGE_WAIT_MS, or on
  // a failure, the rows are drawn as one flat group and stay that way. The
  // preview skips them when the model organisms fill it.
  const needsLineages =
    mode.view === 'all' ||
    (results !== undefined && previewNeedsLineages(results, refTaxId))
  const { data: lineages, error: lineageError } = useSWRImmutable(
    results && results.length > 0 && needsLineages
      ? ['lineages', geneId, scope.id]
      : null,
    () =>
      Promise.race([
        fetchTaxonAncestors((results ?? []).map(r => r.assembly.taxonId)),
        delay(LINEAGE_WAIT_MS).then(() => null),
      ]),
    LIVE_QUERY,
  )
  const grouped =
    !needsLineages || lineages !== undefined || lineageError !== undefined
  const scoped = scope.taxa.length > 0

  const scopeControl = mode.view === 'all' && (
    <label className="gene-scope">
      Limit to{' '}
      <select
        className="ui-select"
        value={scope.id}
        onChange={e => {
          mode.onScope(e.target.value)
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
  )
  const table = mode.view === 'all' && results && results.length > 0 && grouped

  return (
    <section className="gene-section">
      {mode.view === 'preview' ? (
        <div className="gene-section-head">
          <h2>Orthologs</h2>
        </div>
      ) : (
        !table && <div className="orthologs-toolbar">{scopeControl}</div>
      )}
      {loading && <p className="ui-hint">Fetching orthologs of {symbol}…</p>}
      <ErrorWithRetry
        error={error}
        onRetry={onRetry}
        className="ui-error"
      />
      <ErrorWithRetry
        error={refError}
        onRetry={onRetryRef}
        className="ui-error"
        context="The reference species' own row did not load"
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
          ) : table ? (
            <OrthologResultsTable
              // Remounted per gene and scope, which is what drops the previous
              // answer's filter text, ticks and open clades.
              key={`${geneId}:${refTaxId}:${scope.id}`}
              symbol={symbol}
              results={results}
              refResult={refResult}
              drilldown={drilldown}
              lineages={lineages ?? undefined}
              toolbarStart={scopeControl}
            />
          ) : (
            <OrthologPreview
              results={results}
              refResult={refResult}
              drilldown={drilldown}
              lineages={lineages ?? undefined}
              allHref={geneUrl('/orthologs/', symbol, refTaxId)}
            />
          )}
        </>
      )}
    </section>
  )
}
