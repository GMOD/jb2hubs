import { useEffect, useMemo, useState } from 'react'

import { Search } from 'lucide-react'

import styles from './SearchPage.module.css'
import { useSearchIndex } from '../hooks/useSearchIndex.ts'
import OrangeStar from './OrangeStar.tsx'
import RedX from './RedX.tsx'
import {
  CURATED_CLADES,
  useTaxonomyFilter,
} from '../hooks/useTaxonomyFilter.ts'

import type { IndexEntry } from '../hooks/useSearchIndex.ts'

const PAGE_SIZE = 100

function getURLParam(key: string) {
  return new URLSearchParams(window.location.search).get(key) ?? ''
}

function scoreTerm(term: string, field: string) {
  if (field.startsWith(term)) {
    return 3
  }
  if (field.includes(` ${term}`)) {
    return 2
  }
  if (field.includes(term)) {
    return 1
  }
  return 0
}

function scoreEntry(entry: IndexEntry, terms: string[]) {
  const accession = entry[0].toLowerCase()
  const commonName = entry[1].toLowerCase()
  const scientificName = entry[2].toLowerCase()
  const assemblyName = entry[3].toLowerCase()
  const all = `${accession} ${commonName} ${scientificName} ${assemblyName}`

  if (!terms.every(term => all.includes(term))) {
    return -1
  }

  // Score based on best match position per term, using max (not sum)
  // across fields to avoid rewarding incidental matches in multiple fields
  let score = 0
  for (const term of terms) {
    const best = Math.max(
      scoreTerm(term, commonName) * 4,
      scoreTerm(term, scientificName) * 3,
      scoreTerm(term, accession) * 2,
      scoreTerm(term, assemblyName),
    )
    score += best
  }
  // Tiebreaker: prefer shorter commonName (closer match to query)
  // e.g. "human (...)" beats "human papillomavirus type 85 (...)"
  // Extract the name part before any parenthetical
  const nameBeforeParen = commonName.split('(')[0]!.trim()
  score += 1 / (1 + nameBeforeParen.length)

  // Tiebreaker: prefer UCSC canonical browsers (hg38, mm39, etc.)
  if (entry[5] === 'ucsc') {
    score += 0.5
  }

  // Tiebreaker: prefer Chromosome-level assemblies
  const status = entry[4].toLowerCase()
  if (status === 'chromosome') {
    score += 0.01
  } else if (status === 'complete genome') {
    score += 0.005
  }
  return score
}

function highlightMatch(text: string, query: string) {
  if (!query.trim()) {
    return text
  }
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(t => t.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return text
    .split(new RegExp(`(${terms.join('|')})`, 'gi'))
    .map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))
}

function entryHref(entry: IndexEntry) {
  return entry[5] === 'ucsc' ? `/ucsc/${entry[0]}` : `/accession/${entry[0]}`
}

export default function SearchPage() {
  const { index, loading } = useSearchIndex()
  const cladeSets = useTaxonomyFilter()
  const [query, setQuery] = useState(() => getURLParam('q'))
  const [clade, setClade] = useState(() => getURLParam('clade'))
  const [page, setPage] = useState(0)

  useEffect(() => {
    const url = new URL(window.location.href)
    if (query) {
      url.searchParams.set('q', query)
    } else {
      url.searchParams.delete('q')
    }
    if (clade) {
      url.searchParams.set('clade', clade)
    } else {
      url.searchParams.delete('clade')
    }
    window.history.replaceState({}, '', url.toString())
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

  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount - 1)
  const pagedResults = results.slice(
    clampedPage * PAGE_SIZE,
    (clampedPage + 1) * PAGE_SIZE,
  )

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
        <table>
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
                  <a href={entryHref(entry)}>
                    {highlightMatch(entry[2], query)}
                  </a>
                </td>
                <td>{highlightMatch(entry[1], query)}</td>
                <td>{highlightMatch(entry[0], query)}</td>
                <td>{highlightMatch(entry[3], query)}</td>
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
