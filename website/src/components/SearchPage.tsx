import { useEffect, useMemo, useRef, useState } from 'react'

import { Search } from 'lucide-react'

import OrangeStar from './OrangeStar.tsx'
import RedX from './RedX.tsx'
import styles from './SearchPage.module.css'
import { entryHref, scoreEntry } from './searchScoring.ts'
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

export default function SearchPage() {
  const { index, loading } = useSearchIndex()
  const cladeSets = useTaxonomyFilter()
  const [query, setQuery] = useUrlState('q', '')
  const [clade, setClade] = useUrlState('clade', '')
  const [page, setPage] = useState(0)
  const tableRef = useRef<HTMLTableElement>(null)
  useSearchHighlight(tableRef, query)

  useEffect(() => {
    setPage(0)
  }, [query, clade])

  const results = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) {
      return []
    }
    const cladeSet = clade && cladeSets ? cladeSets.get(clade) : undefined
    const scored: { entry: IndexEntry; score: number }[] = []
    for (const entry of index) {
      if (cladeSet && !cladeSet.has(entry[6])) {
        continue
      }
      const score = scoreEntry(entry, terms)
      if (score >= 0) {
        scored.push({ entry, score })
      }
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.map(s => s.entry)
  }, [index, query, clade, cladeSets])

  const {
    pageCount,
    clampedPage,
    pageRows: pagedResults,
  } = paginate(results, page, PAGE_SIZE)

  if (loading) {
    return <div>Loading search index...</div>
  }

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
              x
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
      </div>
      {query.trim() && (
        <div className={styles.resultCount}>
          {results.length.toLocaleString()} results for &ldquo;{query.trim()}
          &rdquo;
        </div>
      )}
      {results.length > 0 && (
        <table ref={tableRef}>
          <thead>
            <tr>
              <th>Scientific name</th>
              <th>Common name</th>
              <th>Accession</th>
              <th>Assembly name</th>
              <th>Assembly status</th>
              <th>Category</th>
              <th>NCBI status</th>
            </tr>
          </thead>
          <tbody>
            {pagedResults.map(entry => (
              <tr key={entry[0]}>
                <td>
                  <a href={entryHref(entry)}>{entry[2]}</a>
                </td>
                <td>{entry[1]}</td>
                <td>{entry[0]}</td>
                <td>{entry[3]}</td>
                <td>{entry[4]}</td>
                <td>{entry[5]}</td>
                <td>
                  {entry[7] & 1 ? <OrangeStar /> : null}
                  {entry[7] & 2 ? <RedX /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pageCount > 1 && results.length > 0 && (
        <div className={styles.pagination}>
          <button
            onClick={() => {
              setPage(p => p - 1)
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
              setPage(p => p + 1)
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
