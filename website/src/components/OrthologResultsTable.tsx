import { useMemo, useState } from 'react'

import { features } from '../config/features.ts'
import { downloadText } from '../lib/downloadText.ts'
import { ncbiGeneUrl } from '../lib/externalLinks.ts'
import { LaunchLink } from './DesktopLaunch.tsx'
import ExternalLink from './ExternalLink.tsx'
import OrthologLaunchBar from './OrthologLaunchBar.tsx'
import { formatSpan } from './multiSyntenyLayout.ts'
import { MAX_PICKED_GENOMES } from './multiSyntenyPicker.ts'
import { groupByClade } from './orthologClades.ts'
import {
  COMMON_TAX_RANK,
  formatNumber,
  geneSpanRatio,
  geneUrl,
  matchesQuery,
  orthoSyntenyUrl,
  orthologSyntenyLink,
  orthologsToTsv,
} from './orthologSearchUtils.ts'

import type { DrilldownData } from './multiSyntenyDrilldown.ts'
import type { OrthologResult } from './orthologSearchUtils.ts'
import type { SyntenyLink } from './syntenyPairIndex.ts'

interface ResultRowProps {
  result: OrthologResult
  symbol: string
  isRef: boolean
  link: SyntenyLink | undefined
  refResult: OrthologResult | undefined
  ticked: boolean
  tickable: boolean
  onTick: () => void
}

// The ortholog's own symbol shows only where it differs from the query's: in
// 636 of 641 TP53 rows it would repeat "TP53", and the rows where NCBI names
// it otherwise (LOC…, actb1) are the ones worth a look.
function ResultRow({
  result: r,
  symbol,
  isRef,
  link,
  refResult,
  ticked,
  tickable,
  onTick,
}: ResultRowProps) {
  const model = COMMON_TAX_RANK.has(r.assembly.taxonId)
  const renamed = r.geneSymbol.toLowerCase() !== symbol.toLowerCase()
  return (
    <tr
      className={isRef ? 'orthologs-row-ref' : undefined}
      title={
        isRef ? 'The reference species your search started from' : undefined
      }
    >
      <td className="orthologs-tick">
        {!isRef && (
          <input
            type="checkbox"
            checked={ticked}
            disabled={!ticked && !tickable}
            onChange={onTick}
            aria-label={`Open ${r.assembly.scientificName} with the others ticked`}
          />
        )}
      </td>
      <td>
        <em className={model ? 'orthologs-model' : undefined}>
          {r.assembly.scientificName}
        </em>
        {r.assembly.commonName ? ` (${r.assembly.commonName})` : ''}
        {renamed && (
          <>
            {' · '}
            <ExternalLink
              href={ncbiGeneUrl(r.geneId)}
              title={`NCBI names this ortholog ${r.geneSymbol}`}
            >
              {r.geneSymbol}
            </ExternalLink>
          </>
        )}
      </td>
      <td>
        <a href={`/accession/${r.assembly.accession}`}>
          {r.assembly.accession}
        </a>
        {r.otherVersion && (
          <span
            className="orthologs-model-label"
            title={`NCBI places this ortholog on ${r.otherVersion}, another version of the assembly we host. The location opens on ours wherever the two versions share the sequence.`}
          >
            NCBI: {r.otherVersion}
          </span>
        )}
      </td>
      <td className="orthologs-loc">
        {r.chromosome}:{formatNumber(r.begin)}–{formatNumber(r.end)}{' '}
        {r.strand > 0 ? '+' : '−'}
      </td>
      <td className="orthologs-loc">
        <SpanCell
          result={r}
          refResult={isRef ? undefined : refResult}
        />
      </td>
      <td className="orthologs-actions">
        <LaunchLink
          href={r.jbrowseUrl}
          title={`Open ${r.assembly.scientificName} at ${r.geneSymbol} (${r.chromosome}) in JBrowse`}
        >
          JBrowse
        </LaunchLink>
        {link && (
          <>
            {' · '}
            <LaunchLink
              href={orthoSyntenyUrl(r, link, refResult)}
              title={`Open pairwise synteny: reference vs ${r.assembly.scientificName}, both centered on ${r.geneSymbol}`}
            >
              Synteny
            </LaunchLink>
          </>
        )}
        {features.proteinBrowser && (
          <>
            {' · '}
            <a
              href={geneUrl(
                '/protein-browser/',
                r.geneSymbol,
                r.assembly.taxonId,
              )}
              title={`Open ${r.geneSymbol} in the ${r.assembly.scientificName} protein browser`}
            >
              Protein
            </a>
          </>
        )}
      </td>
    </tr>
  )
}

// A gene several times longer or shorter than the reference's is worth a
// second look: an expanded intron, a fragmented annotation, or a different
// gene model. 92 of 641 TP53 rows are past 3x either way.
const SPAN_OUTLIER = 3

function SpanCell({
  result,
  refResult,
}: {
  result: OrthologResult
  refResult: OrthologResult | undefined
}) {
  const ratio = refResult && geneSpanRatio(result, refResult)
  const outlier =
    ratio !== undefined && (ratio > SPAN_OUTLIER || ratio < 1 / SPAN_OUTLIER)
  return (
    <>
      {formatSpan(result.end - result.begin + 1)}
      {outlier && (
        <span
          className="orthologs-model-label"
          title={`${ratio.toFixed(1)}× the reference gene's span: an expanded intron, a fragmented annotation, or a different gene model`}
        >
          ×{ratio < 1 ? ratio.toFixed(2) : ratio.toFixed(1)}
        </span>
      )}
    </>
  )
}

interface OrthologResultsTableProps {
  symbol: string
  results: OrthologResult[]
  refResult: OrthologResult | undefined
  drilldown: DrilldownData | undefined
  lineages: Map<number, Set<number>> | undefined
}

export default function OrthologResultsTable({
  symbol,
  results,
  refResult,
  drilldown,
  lineages,
}: OrthologResultsTableProps) {
  const pairIndex = drilldown?.index
  const [query, setQuery] = useState('')
  const [syntenyOnly, setSyntenyOnly] = useState(false)
  // Which clade sections are open, as an override on top of the default (the
  // first group only). Holding overrides rather than the whole open set is what
  // lets the default follow the data — a new search re-groups without leaving a
  // stale label expanded.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())

  const refAccession = refResult?.assembly.accession

  // One link lookup per row, done once rather than per render pass: with several
  // hundred rows this is the only thing in the table that isn't cheap.
  const links = useMemo(() => {
    const found = new Map<string, SyntenyLink>()
    if (pairIndex && refAccession) {
      for (const r of results) {
        const acc = r.assembly.accession
        // Not syntenyLink: it matches across assembly versions, and a panel
        // opening a version the row's coordinates did not come from does not
        // navigate at all. See orthologSyntenyLink.
        const link =
          acc === refAccession
            ? undefined
            : orthologSyntenyLink(pairIndex, r, refAccession)
        if (link) {
          found.set(acc, link)
        }
      }
    }
    return found
  }, [results, pairIndex, refAccession])

  const filtered = useMemo(
    () =>
      results.filter(
        r =>
          matchesQuery(r, query) &&
          (!syntenyOnly || links.has(r.assembly.accession)),
      ),
    [results, query, syntenyOnly, links],
  )

  // Cutting several hundred alphabetised binomials into Primates / Rodents /
  // Birds is what makes the answer readable. Until the lineages land (a second
  // of NCBI, after the rows are already drawn) everything sits in one group,
  // which renders identically minus the headings.
  const groups = useMemo(
    () =>
      lineages
        ? groupByClade(
            filtered,
            r => r.assembly.taxonId,
            lineages,
            refResult?.assembly.taxonId,
          )
        : [{ label: 'All species', rows: filtered }],
    [filtered, lineages, refResult],
  )

  // A filter is a request to see what matched, so every group with a hit opens;
  // otherwise only the first — the reference's own clade, which groupByClade
  // leads with — is open and the rest are one click away.
  const filtering = query.trim() !== '' || syntenyOnly
  const isOpen = (label: string, i: number) =>
    toggled[label] ?? (filtering || i === 0)

  const syntenyCount = links.size
  const allOpen = groups.every((g, i) => isOpen(g.label, i))
  // A launch opens one genome browser per species, the reference among them.
  const tickable = ticked.size < MAX_PICKED_GENOMES - (refResult ? 1 : 0)
  const picked = results.filter(r => ticked.has(r.assembly.accession))
  const tick = (accession: string) => {
    const next = new Set(ticked)
    if (!next.delete(accession)) {
      next.add(accession)
    }
    setTicked(next)
  }

  return (
    <>
      <div className="orthologs-toolbar">
        <input
          type="search"
          className="ui-input orthologs-filter"
          value={query}
          onChange={e => {
            setQuery(e.target.value)
          }}
          placeholder="Filter species, symbol or accession"
          aria-label="Filter the ortholog rows"
        />
        <label
          className="orthologs-toggle"
          title="Only the species we host a whole-genome alignment against the reference for"
        >
          <input
            type="checkbox"
            checked={syntenyOnly}
            disabled={syntenyCount === 0}
            onChange={e => {
              setSyntenyOnly(e.target.checked)
            }}
          />
          With synteny ({syntenyCount})
        </label>
        <span className="orthologs-count">
          {filtered.length === results.length
            ? `${results.length} species`
            : `${filtered.length} of ${results.length} species`}
          {ticked.size === 0 && ' · tick rows to open them together'}
        </span>
        {groups.length > 1 && (
          <button
            className="ui-btn-secondary"
            onClick={() => {
              setToggled(
                Object.fromEntries(groups.map(g => [g.label, !allOpen])),
              )
            }}
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        )}
        <button
          className="ui-btn-secondary"
          onClick={() => {
            downloadText(`${symbol}_orthologs.tsv`, orthologsToTsv(filtered))
          }}
          title="The rows currently shown, as a tab-separated file"
        >
          Download TSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="ui-hint">No ortholog rows match this filter.</p>
      ) : (
        groups.map((group, i) => {
          const open = isOpen(group.label, i)
          return (
            <section
              key={group.label}
              className="orthologs-group"
            >
              <h3 className="orthologs-group-head">
                <button
                  className="orthologs-group-btn"
                  aria-expanded={open}
                  onClick={() => {
                    setToggled(t => ({ ...t, [group.label]: !open }))
                  }}
                >
                  <span className="orthologs-caret">{open ? '▾' : '▸'}</span>
                  {group.label}
                  <span className="orthologs-group-count">
                    {group.rows.length}
                  </span>
                </button>
              </h3>
              {open && (
                <div className="table-scroll">
                  <table className="orthologs-table">
                    <thead>
                      <tr>
                        <th aria-label="Tick to open together" />
                        <th>Species</th>
                        <th>Assembly</th>
                        <th>Location</th>
                        <th>Span</th>
                        <th>Links</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map(r => (
                        <ResultRow
                          key={r.assembly.accession}
                          result={r}
                          symbol={symbol}
                          isRef={r.assembly.accession === refAccession}
                          link={links.get(r.assembly.accession)}
                          refResult={refResult}
                          ticked={ticked.has(r.assembly.accession)}
                          tickable={tickable}
                          onTick={() => {
                            tick(r.assembly.accession)
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )
        })
      )}

      {picked.length > 0 && (
        <OrthologLaunchBar
          picked={picked}
          results={results}
          refResult={refResult}
          drilldown={drilldown}
          lineages={lineages}
          onClear={() => {
            setTicked(new Set())
          }}
        />
      )}
    </>
  )
}
