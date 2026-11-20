import { useMemo } from 'react'

import { genomeAssemblyName } from '../config/jbrowse.ts'
import { OrthologLinks, OtherVersionNote } from './OrthologResultsTable.tsx'
import { previewOrthologs } from './geneHub.ts'
import { groupByClade } from './orthologClades.ts'
import { syntenyLinks } from './orthologLaunches.ts'
import { spanText, strandText } from './orthologResults.ts'

import type { DrilldownData } from './multiSyntenyDrilldown.ts'
import type { OrthologResult } from './orthologResults.ts'

// The ortholog section as it first opens: the reference's own row, shaded, then
// a handful of orthologs, model organisms first, and a link to the full table
// on /orthologs. The reference row carries the gene's place on the genome we
// host and its JBrowse launch, in the same columns as every ortholog's. Several
// hundred rows grouped by clade is the answer a reader asks for, not the one
// they land on.
export default function OrthologPreview({
  results,
  refTaxId,
  refResult,
  drilldown,
  lineages,
  allHref,
}: {
  results: OrthologResult[]
  refTaxId: number
  refResult: OrthologResult | undefined
  drilldown: DrilldownData | undefined
  lineages: Map<number, Set<number>> | undefined
  allHref: string
}) {
  const refAccession = refResult?.assembly.accession
  const rows = useMemo(
    () =>
      previewOrthologs(
        results,
        refAccession,
        lineages &&
          groupByClade(results, r => r.assembly.taxonId, lineages, refTaxId)[0]
            ?.rows,
      ),
    [results, refAccession, refTaxId, lineages],
  )
  const links = useMemo(
    () => syntenyLinks(rows, drilldown?.index, refAccession),
    [rows, drilldown, refAccession],
  )
  const shown = refResult ? [refResult, ...rows] : rows
  return (
    <>
      {shown.length > 0 && (
        <div className="table-scroll">
          <table className="orthologs-table">
            <thead>
              <tr>
                <th>Species</th>
                <th>Location</th>
                <th className="orthologs-strand">Strand</th>
                <th>Open in</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr
                  key={r.assembly.accession}
                  className={r === refResult ? 'orthologs-row-ref' : undefined}
                >
                  <td>
                    <em>{r.assembly.scientificName}</em>
                    {r.assembly.commonName ? ` (${r.assembly.commonName})` : ''}
                    {r === refResult && (
                      <span
                        className="orthologs-model-label"
                        title="The reference species your search started from"
                      >
                        reference · {genomeAssemblyName(r.assembly)}
                      </span>
                    )}
                  </td>
                  <td className="orthologs-loc">
                    {spanText(r.chromosome, r.begin, r.end)}
                    <OtherVersionNote result={r} />
                  </td>
                  <td className="orthologs-strand">{strandText(r.strand)}</td>
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
        <a
          className="ui-btn-secondary"
          href={allHref}
          title="Every species, grouped by clade, with a filter, a download and tick boxes to open several together"
        >
          All {results.length} species →
        </a>
      </div>
    </>
  )
}
