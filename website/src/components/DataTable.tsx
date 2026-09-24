import '../styles/common-table.css'

import { useMemo, useState } from 'react'

import { Search } from 'lucide-react'
import useSWRImmutable from 'swr/immutable'

import { useResetOnChange } from '../hooks/useResetOnChange.ts'
import { useSearchHighlight } from '../hooks/useSearchHighlight.ts'
import { fetchJson } from '../lib/fetchJson.ts'
import { paginate } from '../utils/paginate.ts'
import styles from './DataTable.module.css'
import TableBody from './DataTable/components/TableBody.tsx'
import TableHeader from './DataTable/components/TableHeader.tsx'
import { useCategoryFilter } from './DataTable/hooks/useCategoryFilter.ts'
import { useColumnVisibility } from './DataTable/hooks/useColumnVisibility.ts'
import { useSearchFilter } from './DataTable/hooks/useSearchFilter.ts'
import { useTableColumns } from './DataTable/hooks/useTableColumns.tsx'
import { useTableSort } from './DataTable/hooks/useTableSort.ts'
import { decodeHubRow } from './DataTable/hubRow.ts'
import { makeComparator } from './DataTable/utils.ts'
import ErrorWithRetry from './ErrorWithRetry.tsx'
import Pagination from './Pagination.tsx'
import TableOptions from './TableOptions.tsx'

import type { HubRow, HubTableData } from './DataTable/hubRow.ts'

export type TableProps = HubTableData

// The whole of each named category file. Narrowing to a subtree is deliberately
// NOT done here: it would make the cache entry specific to one page while the
// key (the urls) is not, so two subtrees of the same category would serve each
// other's rows out of the shared SWR cache. Cached this way, they share the one
// download instead, and each narrows it below.
async function loadRows(dataUrls: string[]) {
  const files = await Promise.all(dataUrls.map(url => fetchJson<HubRow[]>(url)))
  return files.flat().map(decodeHubRow)
}

export default function DataTable({
  initialRows,
  dataUrls,
  accessions,
  accessionsUrl,
  totalRows,
}: TableProps) {
  const [pageSize, setPageSize] = useState(200)

  // A table whose first page is the whole set has nothing to fetch: most
  // taxonomy subtrees are under 200 rows, and the category files behind them
  // are megabytes.
  const complete = totalRows <= initialRows.length
  const {
    data: allRows,
    error: rowsError,
    mutate: retryRows,
  } = useSWRImmutable(complete ? null : dataUrls, () => loadRows(dataUrls))
  // One of `accessions` (inline) or `accessionsUrl` (a file, for a large
  // subtree) is set when this table shows a taxonomic subtree rather than a
  // whole category, so the fetched category files get narrowed to it.
  const {
    data: fetchedAccessions,
    error: accessionsError,
    mutate: retryAccessions,
  } = useSWRImmutable(complete ? null : accessionsUrl, fetchJson<string[]>)
  const subset = accessions ?? fetchedAccessions
  // Until the full set lands, searching and sorting would silently apply to only
  // the first page, so the controls stay disabled and these rows are shown as-is.
  // A failed load keeps them that way and says so, rather than "Loading…" for
  // good.
  const loading = !complete && (!allRows || (!!accessionsUrl && !subset))
  const loadError: unknown = rowsError ?? accessionsError
  const rows = useMemo(() => {
    if (!allRows || loading) {
      return initialRows
    }
    if (!subset) {
      return allRows
    }
    const wanted = new Set(subset)
    return allRows.filter(row => wanted.has(row.accession))
  }, [allRows, subset, initialRows, loading])

  const {
    filterOption,
    setFilterOption,
    filteredRows: categoryFilteredRows,
  } = useCategoryFilter(rows)

  const { searchQuery, setSearchQuery, filteredRows } =
    useSearchFilter(categoryFilteredRows)
  const { sortId, sortDesc, handleSort } = useTableSort()
  const { showAllColumns, setShowAllColumns } = useColumnVisibility()
  const { columns } = useTableColumns({ showAllColumns })
  const highlightRef = useSearchHighlight(searchQuery)

  const [pageIndex, setPageIndex] = useResetOnChange(
    `${searchQuery}\u0000${filterOption}`,
    0,
  )

  const sortedRows = useMemo(() => {
    const col = columns.find(c => c.id === sortId)
    const sortValue = col?.sortValue
    if (!sortValue) {
      return filteredRows
    }
    return filteredRows.toSorted(makeComparator(sortValue, sortDesc))
  }, [filteredRows, sortId, sortDesc, columns])

  const {
    pageCount,
    clampedPage: clampedPageIndex,
    pageRows: pagedRows,
  } = paginate(sortedRows, pageIndex, pageSize)

  return (
    <>
      <div className={styles.searchContainer}>
        <div className={styles.searchInputWrapper}>
          <Search
            className={styles.searchIcon}
            size={16}
          />
          <input
            type="text"
            placeholder="Search by common name, scientific name, NCBI assembly name, or accession..."
            aria-label="Search assemblies"
            value={searchQuery}
            disabled={loading}
            onChange={e => {
              setSearchQuery(e.target.value)
            }}
            className={styles.searchInput}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
              }}
              className={styles.clearButton}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        {loading && !loadError && (
          <span className={styles.loadingNote}>
            Loading all {totalRows.toLocaleString()} assemblies…
          </span>
        )}
        <ErrorWithRetry
          error={loadError}
          onRetry={() => {
            void retryRows()
            void retryAccessions()
          }}
          context={`Couldn't load all ${totalRows.toLocaleString()} assemblies, so search and sort are off`}
          className={`ui-error ${styles.loadError}`}
        />
      </div>

      <TableOptions
        filterOption={filterOption}
        setFilterOption={setFilterOption}
        showAllColumns={showAllColumns}
        setShowAllColumns={setShowAllColumns}
        disabled={loading}
      />

      <div
        className="table-scroll"
        ref={highlightRef}
      >
        <table>
          <TableHeader
            columns={columns}
            handleSort={handleSort}
            sortId={sortId}
            sortDesc={sortDesc}
            sortable={!loading}
          />
          <TableBody
            columns={columns}
            rows={pagedRows}
          />
        </table>
      </div>

      <Pagination
        pageIndex={clampedPageIndex}
        pageSize={pageSize}
        pageCount={pageCount}
        totalRows={loading ? totalRows : sortedRows.length}
        rowsOnPage={pagedRows.length}
        onPageChange={setPageIndex}
        onPageSizeChange={size => {
          setPageSize(size)
          setPageIndex(0)
        }}
        disabled={loading}
      />
    </>
  )
}
