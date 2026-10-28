import '../styles/common-table.css'

import { useRef } from 'react'

import useSWRImmutable from 'swr/immutable'

import { useSearchHighlight } from '../hooks/useSearchHighlight.ts'
import { useUrlPagination } from '../hooks/useUrlPagination.ts'
import { useUrlState } from '../hooks/useUrlState.ts'
import { fetchJson } from '../lib/fetchJson.ts'
import { matchesAllTerms, searchTerms } from '../lib/searchTerms.ts'
import { paginate } from '../utils/paginate.ts'
import styles from './DataTable.module.css'
import { tableColumns } from './DataTable/columns.tsx'
import TableBody from './DataTable/components/TableBody.tsx'
import TableHeader from './DataTable/components/TableHeader.tsx'
import { useCategoryFilter } from './DataTable/hooks/useCategoryFilter.ts'
import { useTableSort } from './DataTable/hooks/useTableSort.ts'
import { mergeRowFiles } from './DataTable/hubRow.ts'
import { makeComparator } from './DataTable/utils.ts'
import ErrorWithRetry from './ErrorWithRetry.tsx'
import Pagination from './Pagination.tsx'
import SearchBox from './SearchBox.tsx'
import TableOptions from './TableOptions.tsx'

import type { HubRow, HubTableData, RowData } from './DataTable/hubRow.ts'

export type TableProps = HubTableData

// The whole of each named category file. Narrowing to a subtree is deliberately
// NOT done here: it would make the cache entry specific to one page while the
// key (the urls) is not, so two subtrees of the same category would serve each
// other's rows out of the shared SWR cache. Cached this way, they share the one
// download instead, and each narrows it below.
async function loadRows(dataUrls: string[]) {
  const files = await Promise.all(dataUrls.map(url => fetchJson<HubRow[]>(url)))
  return mergeRowFiles(files)
}

function searchableText(row: RowData) {
  return `${row.commonName} ${row.scientificName} ${row.ncbiAssemblyName} ${row.accession} ${row.submitterOrg}`
}

const PAGE_SIZE = 200

export default function DataTable({
  initialRows,
  dataUrls,
  accessions,
  accessionsUrl,
  totalRows,
}: TableProps) {
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
  const wanted = subset && new Set(subset)
  const rows =
    !allRows || loading
      ? initialRows
      : wanted
        ? allRows.filter(row => wanted.has(row.accession))
        : allRows

  const { page, pageSize, setPage, setPageSize, fromPageOne } =
    useUrlPagination(PAGE_SIZE)

  const category = useCategoryFilter(rows)
  const setFilterOption = fromPageOne(category.setFilterOption)
  const [searchQuery, writeSearchQuery] = useUrlState('search', '')
  const setSearchQuery = fromPageOne(writeSearchQuery)
  const sort = useTableSort()
  const handleSort = fromPageOne(sort.handleSort)
  const { filterOption } = category
  const { sortId, sortDesc } = sort
  const [show, setShow] = useUrlState('show', '')
  const showAllColumns = show === 'true'
  const columns = tableColumns(showAllColumns)
  const highlightRef = useSearchHighlight(searchQuery)
  const tableRef = useRef<HTMLTableElement>(null)

  const terms = searchTerms(searchQuery)
  const filteredRows =
    terms.length === 0
      ? category.filteredRows
      : category.filteredRows.filter(row =>
          matchesAllTerms(searchableText(row), terms),
        )
  const sortValue = columns.find(c => c.id === sortId)?.sortValue
  const sortedRows = sortValue
    ? filteredRows.toSorted(makeComparator(sortValue, sortDesc))
    : filteredRows

  const {
    pageCount,
    clampedPage: clampedPageIndex,
    pageRows: pagedRows,
  } = paginate(sortedRows, page, pageSize)

  return (
    <>
      <div className={styles.searchContainer}>
        <SearchBox
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by common name, scientific name, NCBI assembly name, or accession..."
          label="Search assemblies"
          disabled={loading}
        />
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
        setShowAllColumns={value => {
          setShow(value ? 'true' : '')
        }}
        disabled={loading}
      />

      <div
        className="table-scroll"
        ref={highlightRef}
      >
        <table ref={tableRef}>
          <TableHeader
            columns={columns.map(c => ({
              ...c,
              enableSorting: c.sortValue !== undefined,
            }))}
            handleSort={handleSort}
            sortId={sortId}
            sortDesc={sortDesc}
            sortable={!loading}
          />
          <TableBody
            columns={columns}
            rows={pagedRows}
            emptyMessage={
              loading
                ? loadError
                  ? 'The assemblies did not load.'
                  : 'Loading…'
                : searchQuery.trim()
                  ? `No assemblies match “${searchQuery.trim()}”${filterOption === 'all' ? '' : ' with this filter'}.`
                  : 'No assemblies match this filter.'
            }
          />
        </table>
      </div>

      <Pagination
        pageIndex={clampedPageIndex}
        pageSize={pageSize}
        pageCount={pageCount}
        totalRows={loading ? totalRows : sortedRows.length}
        rowsOnPage={pagedRows.length}
        onPageChange={setPage}
        tableRef={tableRef}
        onPageSizeChange={setPageSize}
        disabled={loading}
      />
    </>
  )
}
