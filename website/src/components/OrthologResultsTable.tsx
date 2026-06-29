import {
  COMMON_TAX_RANK,
  buildMultiSyntenyUrl,
  formatNumber,
  orthoSyntenyUrl,
  planMultiSynteny,
} from './orthologSearchUtils.ts'

import type { OrthologResult } from './orthologSearchUtils.ts'

interface ResultRowProps {
  result: OrthologResult
  isRef: boolean
  syntenyUrl: string | null
}

function ResultRow({ result: r, isRef, syntenyUrl }: ResultRowProps) {
  return (
    <tr>
      <td>
        <em>{r.assembly.scientificName}</em>
        {r.assembly.commonName ? ` (${r.assembly.commonName})` : ''}
      </td>
      <td>
        <a
          href={`https://www.ncbi.nlm.nih.gov/gene/${r.geneId}`}
          target="_blank"
          rel="noreferrer"
        >
          {r.geneSymbol}
        </a>
      </td>
      <td>
        <a href={`/accession/${r.assembly.accession}`}>
          {r.assembly.accession}
        </a>
      </td>
      <td className="orthologs-loc">
        {r.chromosome}:{formatNumber(r.begin)}–{formatNumber(r.end)}
      </td>
      <td className="orthologs-actions">
        <a
          href={r.jbrowseUrl}
          target="_blank"
          rel="noreferrer"
        >
          JBrowse
        </a>
        {isRef && <span className="orthologs-ref-label">ref</span>}
        {syntenyUrl && (
          <>
            {' · '}
            <a
              href={syntenyUrl}
              target="_blank"
              rel="noreferrer"
            >
              Synteny
            </a>
          </>
        )}
      </td>
    </tr>
  )
}

interface OrthologResultsTableProps {
  results: OrthologResult[]
  refAccession: string | undefined
  syntenyPairs: Record<string, string> | undefined
}

export default function OrthologResultsTable({
  results,
  refAccession,
  syntenyPairs,
}: OrthologResultsTableProps) {
  function syntenyTrackId(orthoAccession: string) {
    if (!syntenyPairs || !refAccession) {
      return null
    }
    return (
      syntenyPairs[`${orthoAccession},${refAccession}`] ??
      syntenyPairs[`${refAccession},${orthoAccession}`] ??
      null
    )
  }

  // The reference ortholog row, so a synteny launch can window both panels.
  const refResult = results.find(r => r.assembly.accession === refAccession)

  // Auto-infer a single multi-species synteny view from the whole ortholog set.
  // Only surfaced when it chains 3+ rows — a 2-row chain adds nothing over the
  // per-row pairwise "Synteny" links already in the table.
  const multiPlan =
    refAccession && syntenyPairs
      ? planMultiSynteny(results, refAccession, syntenyPairs)
      : null
  const multiSyntenyUrl =
    multiPlan && multiPlan.rows.length >= 3
      ? buildMultiSyntenyUrl(multiPlan)
      : null

  return (
    <>
      {multiPlan && multiSyntenyUrl && (
        <p className="orthologs-summary">
          <a
            href={multiSyntenyUrl}
            target="_blank"
            rel="noreferrer"
          >
            Launch multi-species synteny view
          </a>{' '}
          ({multiPlan.rows.length} species:{' '}
          {multiPlan.rows
            .map(r => r.assembly.commonName ?? r.assembly.scientificName)
            .join(' → ')}
          )
        </p>
      )}
      <table className="orthologs-table">
        <thead>
          <tr>
            <th>Species</th>
            <th>Gene</th>
            <th>Assembly</th>
            <th>Location</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {results.flatMap((r, i) => {
            const isRef = r.assembly.accession === refAccession
            const trackId = isRef ? null : syntenyTrackId(r.assembly.accession)
            const syntenyUrl =
              trackId && refAccession
                ? orthoSyntenyUrl(refAccession, r, trackId, refResult)
                : null
            const next = results[i + 1]
            const isLastCommon =
              COMMON_TAX_RANK.has(r.assembly.taxonId) &&
              next &&
              !COMMON_TAX_RANK.has(next.assembly.taxonId)

            const rows = [
              <ResultRow
                key={r.assembly.accession}
                result={r}
                isRef={isRef}
                syntenyUrl={syntenyUrl}
              />,
            ]
            if (isLastCommon) {
              rows.push(
                <tr
                  key={`divider-${i}`}
                  className="orthologs-divider"
                >
                  <td colSpan={5} />
                </tr>,
              )
            }
            return rows
          })}
        </tbody>
      </table>
    </>
  )
}
