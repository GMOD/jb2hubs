import { useDeferredValue, useMemo } from 'react'

import { Search, X } from 'lucide-react'

import {
  genarkConfigPath,
  jbrowseUrl,
  ucscConfigPath,
} from '../config/jbrowse.ts'
import { useSearchHighlight } from '../hooks/useSearchHighlight.ts'
import { useSearchIndex } from '../hooks/useSearchIndex.ts'
import { useTaxonomyFilter } from '../hooks/useTaxonomyFilter.ts'
import { useUrlState } from '../hooks/useUrlState.ts'
import { IS_REFERENCE, IS_SUPPRESSED } from '../lib/searchIndex.ts'
import { searchTerms } from '../lib/searchTerms.ts'
import { CURATED_CLADES, cladeDisplay } from '../lib/taxonomyClades.ts'
import {
  pageIndexFromParam,
  pageSizeFromParam,
  paginate,
} from '../utils/paginate.ts'
import ErrorWithRetry from './ErrorWithRetry.tsx'
import OrangeStar from './OrangeStar.tsx'
import Pagination from './Pagination.tsx'
import RedX from './RedX.tsx'
import styles from './SearchPage.module.css'
import { entryHref, isCurated, rankEntries } from './searchScoring.ts'

import type { IndexEntry } from '../lib/searchIndex.ts'

const EXAMPLE_QUERIES = ['human', 'mouse', 'zebrafish', 'GCF_000001405']

const PAGE_SIZE = 100

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
  const { index, loading, error: indexError, retry } = useSearchIndex()
  const [query, writeQuery] = useUrlState('q', '')
  const [clade, writeClade] = useUrlState('clade', '')
  const clades = useTaxonomyFilter(!!clade)
  const cladeSets = clades.cladeSets
  const [curatedOnly, writeCuratedOnly] = useUrlState('curated', '')
  const [pageParam, writePage] = useUrlState('page', '1')
  const [sizeParam, writeSize] = useUrlState('size', String(PAGE_SIZE))
  const page = pageIndexFromParam(pageParam)
  const pageSize = pageSizeFromParam(sizeParam, PAGE_SIZE)
  const setPage = (index: number) => {
    writePage(String(index + 1))
  }
  // A new query or filter asks a different question, so it starts on page one.
  const fromPageOne = (write: (value: string) => void) => (value: string) => {
    write(value)
    setPage(0)
  }
  const setQuery = fromPageOne(writeQuery)
  const setClade = fromPageOne(writeClade)
  const setCuratedOnly = fromPageOne(writeCuratedOnly)

  const trimmedQuery = query.trim()
  // Ranked a render behind the box, so a keystroke paints before the index is
  // scanned; the results, their count and their highlight all read this one.
  const rankedQuery = useDeferredValue(trimmedQuery)
  const highlightRef = useSearchHighlight(rankedQuery)

  // A chosen clade whose member list has not arrived is not "no clade": ranking
  // the whole index meanwhile showed results the filter would have excluded.
  const cladePending = !!clade && !cladeSets
  const results = useMemo(() => {
    const terms = searchTerms(rankedQuery)
    const cladeSet = clade && cladeSets ? cladeSets.get(clade) : undefined
    return terms.length === 0 || cladePending
      ? []
      : rankEntries(
          index,
          terms,
          entry =>
            (!cladeSet || cladeSet.has(entry[6])) &&
            (!curatedOnly || isCurated(entry)),
        )
  }, [index, rankedQuery, clade, curatedOnly, cladeSets, cladePending])
  const nothingFound =
    !loading &&
    !indexError &&
    !cladePending &&
    !!rankedQuery &&
    results.length === 0

  const {
    pageCount,
    clampedPage,
    pageRows: pagedResults,
  } = paginate(results, page, pageSize)

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
            aria-label="Search genomes"
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
          aria-label="Clade"
          value={clade}
          onChange={e => {
            setClade(e.target.value)
          }}
          className={styles.categorySelect}
        >
          <option value="">All clades</option>
          {CURATED_CLADES.map(clade => (
            <option
              key={clade.label}
              value={clade.label}
            >
              {cladeDisplay(clade)}
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
      <ErrorWithRetry
        error={indexError}
        onRetry={retry}
        context="Couldn't load the genome list"
        className="ui-error"
      />
      {clades.loading && trimmedQuery && (
        <div className={styles.noResults}>Loading the clade filter…</div>
      )}
      <ErrorWithRetry
        error={clades.error}
        onRetry={clades.retry}
        context="Couldn't load the clade filter"
        className="ui-error"
      />
      {!loading && !indexError && !trimmedQuery && (
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
      {nothingFound && (
        <div className={styles.noResults}>
          No genomes match &ldquo;{rankedQuery}&rdquo;
          {clade ? ' in this clade' : ''}
          {curatedOnly ? ' among reference assemblies' : ''}. Try a different
          spelling, or broaden your filters.
        </div>
      )}
      {rankedQuery && results.length > 0 && (
        <div className={styles.resultCount}>
          {results.length.toLocaleString()} results for &ldquo;{rankedQuery}
          &rdquo;
        </div>
      )}
      {results.length > 0 && (
        <div
          className="table-scroll"
          ref={highlightRef}
        >
          <table>
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
                    {entry[7] & IS_REFERENCE ? <OrangeStar /> : null}
                    {entry[7] & IS_SUPPRESSED ? <RedX /> : null}
                  </td>
                  <td>
                    <a href={launchUrl(entry)}>JBrowse</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {results.length > 0 && statusLegend}
      {results.length > 0 && (
        <Pagination
          pageIndex={clampedPage}
          pageSize={pageSize}
          pageCount={pageCount}
          totalRows={results.length}
          rowsOnPage={pagedResults.length}
          onPageChange={setPage}
          onPageSizeChange={size => {
            writeSize(String(size))
            setPage(0)
          }}
        />
      )}
    </div>
  )
}
