import { useMemo, useState } from 'react'

import { downloadText } from '../lib/downloadText.ts'
import { ncbiGeneUrl } from '../lib/externalLinks.ts'
import { groupByClade } from './orthologClades.ts'
import { speciesLabel } from './orthologDb.ts'
import {
  COMMON_TAX_RANK,
  buildMultiSyntenyUrl,
  formatNumber,
  matchesQuery,
  orthoSyntenyUrl,
  orthologsToTsv,
  planMultiSynteny,
} from './orthologSearchUtils.ts'
import { syntenyLink } from './syntenyPairIndex.ts'

import type { OrthologResult } from './orthologSearchUtils.ts'
import type { PairIndex, SyntenyLink } from './syntenyPairIndex.ts'

interface ResultRowProps {
  result: OrthologResult
  isRef: boolean
  link: SyntenyLink | undefined
  refResult: OrthologResult | undefined
}

function ResultRow({ result: r, isRef, link, refResult }: ResultRowProps) {
  return (
    <tr>
      <td title={r.assembly.commonName || undefined}>
        <em>{r.assembly.scientificName}</em>
        {r.assembly.commonName
          ? ` (${speciesLabel(r.assembly.commonName)})`
          : ''}
        {COMMON_TAX_RANK.has(r.assembly.taxonId) && (
          <span
            className="orthologs-model-label"
            title="A model organism"
          >
            model
          </span>
        )}
      </td>
      <td>
        <a
          href={ncbiGeneUrl(r.geneId)}
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
          title={`Open ${r.assembly.scientificName} at ${r.geneSymbol} (${r.chromosome}) in JBrowse`}
        >
          JBrowse
        </a>
        {isRef && (
          <span
            className="orthologs-ref-label"
            title="The reference species your search started from"
          >
            ref
          </span>
        )}
        {link && (
          <>
            {' · '}
            <a
              href={orthoSyntenyUrl(r, link, refResult)}
              target="_blank"
              rel="noreferrer"
              title={`Open pairwise synteny: reference vs ${r.assembly.scientificName}, both centered on ${r.geneSymbol}`}
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
  refResult: OrthologResult | undefined
  pairIndex: PairIndex | undefined
  lineages: Map<number, Set<number>> | undefined
}

export default function OrthologResultsTable({
  results,
  refResult,
  pairIndex,
  lineages,
}: OrthologResultsTableProps) {
  const [query, setQuery] = useState('')
  const [syntenyOnly, setSyntenyOnly] = useState(false)
  // Which clade sections are open, as an override on top of the default (the
  // first group only). Holding overrides rather than the whole open set is what
  // lets the default follow the data — a new search re-groups without leaving a
  // stale label expanded.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  const refAccession = refResult?.assembly.accession

  // One link lookup per row, done once rather than per render pass: with several
  // hundred rows this is the only thing in the table that isn't cheap.
  const links = useMemo(() => {
    const found = new Map<string, SyntenyLink>()
    if (pairIndex && refAccession) {
      for (const r of results) {
        const acc = r.assembly.accession
        const link =
          acc === refAccession
            ? undefined
            : syntenyLink(pairIndex, acc, refAccession)
        if (link) {
          found.set(acc, link)
        }
      }
    }
    return found
  }, [results, pairIndex, refAccession])

  // Auto-infer a single multi-species synteny view from the whole ortholog set.
  // Only surfaced when it chains 3+ rows — a 2-row chain adds nothing over the
  // per-row pairwise "Synteny" links already in the table. Memoized because the
  // chain search is quadratic in the row count, and the row count runs to the
  // hundreds while the filter box re-renders on every keystroke.
  const multiPlan = useMemo(
    () =>
      refAccession && pairIndex
        ? planMultiSynteny(results, refAccession, pairIndex)
        : null,
    [results, refAccession, pairIndex],
  )
  const multiSyntenyUrl =
    multiPlan && multiPlan.rows.length >= 3
      ? buildMultiSyntenyUrl(multiPlan)
      : null

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
          {multiPlan.rows.map(r => r.assembly.scientificName).join(' → ')})
        </p>
      )}

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
        </span>
        <button
          className="ui-btn-secondary"
          onClick={() => {
            downloadText(
              `${refResult?.geneSymbol ?? 'gene'}_orthologs.tsv`,
              orthologsToTsv(filtered),
            )
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
                <table className="orthologs-table">
                  <thead>
                    <tr>
                      <th>Species</th>
                      <th>Gene</th>
                      <th>Assembly</th>
                      <th>Location</th>
                      <th>Links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map(r => (
                      <ResultRow
                        key={r.assembly.accession}
                        result={r}
                        isRef={r.assembly.accession === refAccession}
                        link={links.get(r.assembly.accession)}
                        refResult={refResult}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )
        })
      )}
    </>
  )
}
