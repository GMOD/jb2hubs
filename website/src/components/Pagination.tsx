import styles from './DataTable.module.css'

import type { RowData } from './DataTable/hooks/useTableColumns.tsx'
import type { Table } from '@tanstack/react-table'

interface PaginationProps {
  table: Table<RowData>
}

export default function Pagination({ table }: PaginationProps) {
  return (
    <div className={styles.paginationContainer}>
      <button
        className={styles.paginationButton}
        onClick={() => {
          table.setPageIndex(0)
        }}
        disabled={!table.getCanPreviousPage()}
        aria-label="First page"
      >
        {'<<'}
      </button>
      <button
        className={styles.paginationButton}
        onClick={() => {
          table.previousPage()
        }}
        disabled={!table.getCanPreviousPage()}
        aria-label="Previous page"
      >
        {'<'}
      </button>
      <span className={styles.pageInfo}>
        Page{' '}
        <strong>
          {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </strong>
      </span>
      <button
        className={styles.paginationButton}
        onClick={() => {
          table.nextPage()
        }}
        disabled={!table.getCanNextPage()}
        aria-label="Next page"
      >
        {'>'}
      </button>
      <button
        className={styles.paginationButton}
        onClick={() => {
          table.setPageIndex(table.getPageCount() - 1)
        }}
        disabled={!table.getCanNextPage()}
        aria-label="Last page"
      >
        {'>>'}
      </button>
      <div className={styles.pageSizeSelector}>
        <label htmlFor="pageSize">Show:</label>
        <select
          id="pageSize"
          value={table.getState().pagination.pageSize}
          onChange={e => {
            const newSize = Number(e.target.value)
            table.setPageSize(newSize)
          }}
          className={styles.pageSizeSelect}
        >
          <option value={100}>100</option>
          <option value={200}>200</option>
          <option value={500}>500</option>
          <option value={1000}>1000</option>
          <option value={10000}>10000</option>
        </select>
        <span>rows</span>
      </div>
      <span className={styles.rowCount}>
        Showing {table.getRowModel().rows.length} of{' '}
        {table.getFilteredRowModel().rows.length} rows
      </span>
    </div>
  )
}
