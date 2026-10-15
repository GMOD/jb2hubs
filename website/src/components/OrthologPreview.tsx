import { useMemo } from 'react'

import { OrthologLinks, syntenyLinks } from './OrthologResultsTable.tsx'
import { previewOrthologs } from './geneHub.ts'
import { formatNumber } from './orthologSearchUtils.ts'

import type { DrilldownData } from './multiSyntenyDrilldown.ts'
import type { CladeGroup } from './orthologClades.ts'
import type { OrthologResult } from './orthologSearchUtils.ts'

// The ortholog section as it first opens: a handful of rows, model organisms
// first, and a button into the full table. Several hundred rows grouped by
// clade is the answer a reader asks for, not the one they land on.
export default function OrthologPreview({
  results,
  refResult,
  drilldown,
  groups,
  onShowAll,
}: {
  results: OrthologResult[]
  refResult: OrthologResult | undefined
  drilldown: DrilldownData | undefined
  groups: CladeGroup<OrthologResult>[]
  onShowAll: () => void
}) {
  const refAccession = refResult?.assembly.accession
  const rows = useMemo(
    () => previewOrthologs(results, refAccession, groups[0]?.rows),
    [results, refAccession, groups],
  )
  const links = useMemo(
    () => syntenyLinks(rows, drilldown?.index, refAccession),
    [rows, drilldown, refAccession],
  )
  return (
    <>
      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="orthologs-table">
            <thead>
              <tr>
                <th>Species</th>
                <th>Location</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.assembly.accession}>
                  <td>
                    <em>{r.assembly.scientificName}</em>
                    {r.assembly.commonName ? ` (${r.assembly.commonName})` : ''}
                  </td>
                  <td className="orthologs-loc">
                    {r.chromosome}:{formatNumber(r.begin)}–{formatNumber(r.end)}{' '}
                    {r.strand > 0 ? '+' : '−'}
                  </td>
                  <td className="orthologs-actions">
                    <OrthologLinks
                      result={r}
                      link={links.get(r.assembly.accession)}
                      refResult={refResult}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="orthologs-more">
        <button
          className="ui-btn-secondary"
          onClick={() => {
            onShowAll()
          }}
          title="Every species, grouped by clade, with a filter, a download and tick boxes to open several together"
        >
          Show all {results.length} species
        </button>
      </div>
    </>
  )
}
