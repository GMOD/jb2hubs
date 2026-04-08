import { useMemo, useState } from 'react'

import { Search } from 'lucide-react'

import TableBody from './DataTable/components/TableBody.tsx'
import TableHeader from './DataTable/components/TableHeader.tsx'
import { useCategoryFilter } from './DataTable/hooks/useCategoryFilter.ts'
import { useColumnVisibility } from './DataTable/hooks/useColumnVisibility.ts'
import { useSearchFilter } from './DataTable/hooks/useSearchFilter.ts'
import { useTableColumns } from './DataTable/hooks/useTableColumns.tsx'
import { useTableSort } from './DataTable/hooks/useTableSort.ts'
import styles from './DataTable.module.css'
import Pagination from './Pagination.tsx'
import TableOptions from './TableOptions.tsx'

import type { RowData } from './DataTable/hooks/useTableColumns.tsx'

import '../styles/common-table.css'

export interface TableProps {
  rows: RowData[]
}

export default function DataTable({ rows }: TableProps) {
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(200)

  const {
    filterOption,
    setFilterOption,
    filteredRows: categoryFilteredRows,
  } = useCategoryFilter(rows)

  const { searchQuery, setSearchQuery, filteredRows } =
    useSearchFilter(categoryFilteredRows)
  const { sortId, sortDesc, handleSort } = useTableSort()
  const { showAllColumns, setShowAllColumns } = useColumnVisibility()
  const { columns } = useTableColumns({ searchQuery, showAllColumns })

  const sortedRows = useMemo(() => {
    if (!sortId) {
      return filteredRows
    }
    const col = columns.find(c => c.id === sortId)
    if (!col?.sortValue) {
      return filteredRows
    }
    return [...filteredRows].sort((a, b) => {
      const aVal = col.sortValue!(a)
      const bVal = col.sortValue!(b)
      if (aVal < bVal) {
        return sortDesc ? 1 : -1
      }
      if (aVal > bVal) {
        return sortDesc ? -1 : 1
      }
      return 0
    })
  }, [filteredRows, sortId, sortDesc, columns])

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const clampedPageIndex = Math.min(pageIndex, pageCount - 1)
  const pagedRows = sortedRows.slice(
    clampedPageIndex * pageSize,
    (clampedPageIndex + 1) * pageSize,
  )

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
            placeholder="Search by common name, scientific name, NCBI assembly name, or accession number..."
            value={searchQuery}
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
      </div>

      <TableOptions
        filterOption={filterOption}
        setFilterOption={setFilterOption}
        showAllColumns={showAllColumns}
        setShowAllColumns={setShowAllColumns}
      />

      <div>
        <table>
          <TableHeader
            columns={columns}
            handleSort={handleSort}
            sortId={sortId}
            sortDesc={sortDesc}
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
        totalRows={sortedRows.length}
        rowsOnPage={pagedRows.length}
        onPageChange={setPageIndex}
        onPageSizeChange={size => {
          setPageSize(size)
          setPageIndex(0)
        }}
      />
    </>
  )
}
