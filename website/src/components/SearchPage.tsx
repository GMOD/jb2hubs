import { useEffect, useMemo, useRef, useState } from 'react'

import { Search, X } from 'lucide-react'

import OrangeStar from './OrangeStar.tsx'
import RedX from './RedX.tsx'
import styles from './SearchPage.module.css'
import { entryHref, isCurated, scoreEntry } from './searchScoring.ts'
import {
  genarkConfigPath,
  jbrowseUrl,
  ucscConfigPath,
} from '../config/jbrowse.ts'
import { useSearchHighlight } from '../hooks/useSearchHighlight.ts'
import { useSearchIndex } from '../hooks/useSearchIndex.ts'
import {
  CURATED_CLADES,
  useTaxonomyFilter,
} from '../hooks/useTaxonomyFilter.ts'
import { useUrlState } from '../hooks/useUrlState.ts'
import { paginate } from '../utils/paginate.ts'

import type { IndexEntry } from '../hooks/useSearchIndex.ts'

const PAGE_SIZE = 100

const EXAMPLE_QUERIES = ['human', 'mouse', 'zebrafish', 'GCF_000001405']

const statusLegend = (
  <div className={styles.legend}>
    <span className={styles.legendItem}>
      <OrangeStar /> NCBI designated reference genome
    </span>
    <span className={styles.legendItem}>
      <RedX /> NCBI RefSeq suppressed
    </span>
  </div>
)

// A UCSC row's accession field is its db name; GenArk configs are addressed by
// accession.
function launchUrl(entry: IndexEntry) {
  return jbrowseUrl(
    entry[5] === 'ucsc' ? ucscConfigPath(entry[0]) : genarkConfigPath(entry[0]),
  )
}

export default function SearchPage() {
  const { index, loading } = useSearchIndex()
  const cladeSets = useTaxonomyFilter()
  const [query, setQuery] = useUrlState('q', '')
  const [clade, setClade] = useUrlState('clade', '')
  const [curatedOnly, setCuratedOnly] = useUrlState('curated', '')
  const [page, setPage] = useState(0)
  const tableRef = useRef<HTMLTableElement>(null)
  useSearchHighlight(tableRef, query)

  useEffect(() => {
    setPage(0)
  }, [query, clade, curatedOnly])

  const trimmedQuery = query.trim()

  const results = useMemo(() => {
    const terms = trimmedQuery.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) {
      return []
    }
    const cladeSet = clade && cladeSets ? cladeSets.get(clade) : undefined
    const scored: { entry: IndexEntry; score: number }[] = []
    for (const entry of index) {
      const outsideClade = !!cladeSet && !cladeSet.has(entry[6])
      const uncurated = !!curatedOnly && !isCurated(entry)
      if (!outsideClade && !uncurated) {
        const score = scoreEntry(entry, terms)
        if (score >= 0) {
          scored.push({ entry, score })
        }
      }
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.map(s => s.entry)
  }, [index, trimmedQuery, clade, curatedOnly, cladeSets])

  const {
    pageCount,
    clampedPage,
    pageRows: pagedResults,
  } = paginate(results, page, PAGE_SIZE)

  return (
    <div>
      <div className={styles.searchWrapper}>
        <div className={styles.inputWrapper}>
          <Search
            size={16}
            className={styles.searchIcon}
          />
          <input
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
            }}
            placeholder="Search by name, species, or accession..."
            autoComplete="off"
            autoFocus
            className={styles.input}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
              }}
              className={styles.clearButton}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <select
          id="clade-filter"
          value={clade}
          onChange={e => {
            setClade(e.target.value)
          }}
          className={styles.categorySelect}
        >
          <option value="">All clades</option>
          {CURATED_CLADES.map(({ label, display }) => (
            <option
              key={label}
              value={label}
            >
              {display}
            </option>
          ))}
        </select>
        <label
          className={styles.curatedToggle}
          title="Show only UCSC genome browsers and NCBI designated reference genomes, hiding alternate haplotypes and duplicate submissions"
        >
          <input
            type="checkbox"
            checked={!!curatedOnly}
            onChange={e => {
              setCuratedOnly(e.target.checked ? '1' : '')
            }}
          />
          Reference assemblies only
        </label>
      </div>
      {/* The index is several megabytes, so the controls above stay usable while
          it downloads rather than the whole page being replaced by a message. */}
      {loading && <div className={styles.noResults}>Loading search index…</div>}
      {!loading && !trimmedQuery && (
        <div className={styles.emptyState}>
          <p>
            Search {index.length.toLocaleString()} genome assemblies by common
            name, scientific name, or accession.
          </p>
          <p className={styles.examples}>
            Try:{' '}
            {EXAMPLE_QUERIES.map(example => (
              <button
                key={example}
                type="button"
                className={styles.exampleChip}
                onClick={() => {
                  setQuery(example)
                }}
              >
                {example}
              </button>
            ))}
          </p>
          {statusLegend}
        </div>
      )}
      {!loading && trimmedQuery && results.length === 0 && (
        <div className={styles.noResults}>
          No genomes match &ldquo;{trimmedQuery}&rdquo;
          {clade ? ' in this clade' : ''}
          {curatedOnly ? ' among reference assemblies' : ''}. Try a different
          spelling, or broaden your filters.
        </div>
      )}
      {trimmedQuery && results.length > 0 && (
        <div className={styles.resultCount}>
          {results.length.toLocaleString()} results for &ldquo;{trimmedQuery}
          &rdquo;
        </div>
      )}
      {results.length > 0 && (
        <table ref={tableRef}>
          <thead>
            <tr>
              <th scope="col">Scientific name</th>
              <th scope="col">Common name</th>
              <th scope="col">Accession</th>
              <th scope="col">Assembly name</th>
              <th scope="col">Year</th>
              <th scope="col">Assembly status</th>
              <th scope="col">Category</th>
              <th scope="col">NCBI status</th>
              <th scope="col">Browse</th>
            </tr>
          </thead>
          <tbody>
            {pagedResults.map(entry => (
              <tr key={`${entry[5]}-${entry[0]}`}>
                <td>
                  <a href={entryHref(entry)}>{entry[2]}</a>
                </td>
                <td>{entry[1]}</td>
                <td>{entry[0]}</td>
                <td>{entry[3]}</td>
                <td>{entry[8] || ''}</td>
                <td>{entry[4]}</td>
                <td>{entry[5]}</td>
                <td>
                  {entry[7] & 1 ? <OrangeStar /> : null}
                  {entry[7] & 2 ? <RedX /> : null}
                </td>
                <td>
                  <a href={launchUrl(entry)}>JBrowse</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {results.length > 0 && statusLegend}
      {pageCount > 1 && results.length > 0 && (
        <div className={styles.pagination}>
          <button
            onClick={() => {
              setPage(clampedPage - 1)
            }}
            disabled={clampedPage === 0}
          >
            Previous
          </button>
          <span>
            Page {clampedPage + 1} of {pageCount}
          </span>
          <button
            onClick={() => {
              setPage(clampedPage + 1)
            }}
            disabled={clampedPage >= pageCount - 1}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
