import '../styles/common-table.css'

import { useEffect, useMemo, useRef, useState } from 'react'

import { Search } from 'lucide-react'
import useSWRImmutable from 'swr/immutable'

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
import Pagination from './Pagination.tsx'
import TableOptions from './TableOptions.tsx'

import type { HubRow, HubTableData } from './DataTable/hubRow.ts'

export type TableProps = HubTableData

async function loadRows(dataUrls: string[], accessions?: string[]) {
  const files = await Promise.all(dataUrls.map(url => fetchJson<HubRow[]>(url)))
  const rows = files.flat().map(decodeHubRow)
  if (!accessions) {
    return rows
  }
  const wanted = new Set(accessions)
  return rows.filter(row => wanted.has(row.accession))
}

export default function DataTable({
  initialRows,
  dataUrls,
  accessions,
  totalRows,
}: TableProps) {
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(200)
  const tableRef = useRef<HTMLDivElement>(null)

  const { data: allRows } = useSWRImmutable(dataUrls.join(','), () =>
    loadRows(dataUrls, accessions),
  )
  // Until the full set lands, searching and sorting would silently apply to only
  // the first page, so the controls stay disabled and these rows are shown as-is.
  const loading = !allRows
  const rows = allRows ?? initialRows

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
  useSearchHighlight(tableRef, searchQuery)

  useEffect(() => {
    setPageIndex(0)
  }, [searchQuery, filterOption])

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
        {loading && (
          <span className={styles.loadingNote}>
            Loading all {totalRows.toLocaleString()} assemblies…
          </span>
        )}
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
        ref={tableRef}
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
