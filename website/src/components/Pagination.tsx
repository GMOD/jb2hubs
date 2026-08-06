import { useId } from 'react'

import styles from './DataTable.module.css'

interface PaginationProps {
  pageIndex: number
  pageSize: number
  pageCount: number
  totalRows: number
  rowsOnPage: number
  onPageChange: (index: number) => void
  onPageSizeChange: (size: number) => void
  disabled?: boolean
}

export default function Pagination({
  pageIndex,
  pageSize,
  pageCount,
  totalRows,
  rowsOnPage,
  onPageChange,
  onPageSizeChange,
  disabled = false,
}: PaginationProps) {
  // The label/select pair needs a document-unique id, which a literal is not:
  // two paginated tables on one page would give the browser two "pageSize"
  // elements and the label would point at whichever came first.
  const pageSizeId = useId()
  return (
    <div className={styles.paginationContainer}>
      <button
        className={styles.paginationButton}
        onClick={() => {
          onPageChange(0)
        }}
        disabled={disabled || pageIndex === 0}
        aria-label="First page"
      >
        {'<<'}
      </button>
      <button
        className={styles.paginationButton}
        onClick={() => {
          onPageChange(pageIndex - 1)
        }}
        disabled={disabled || pageIndex === 0}
        aria-label="Previous page"
      >
        {'<'}
      </button>
      <span className={styles.pageInfo}>
        Page{' '}
        <strong>
          {pageIndex + 1} of {pageCount}
        </strong>
      </span>
      <button
        className={styles.paginationButton}
        onClick={() => {
          onPageChange(pageIndex + 1)
        }}
        disabled={disabled || pageIndex >= pageCount - 1}
        aria-label="Next page"
      >
        {'>'}
      </button>
      <button
        className={styles.paginationButton}
        onClick={() => {
          onPageChange(pageCount - 1)
        }}
        disabled={disabled || pageIndex >= pageCount - 1}
        aria-label="Last page"
      >
        {'>>'}
      </button>
      <div className={styles.pageSizeSelector}>
        <label htmlFor={pageSizeId}>Show:</label>
        <select
          id={pageSizeId}
          value={pageSize}
          onChange={e => {
            onPageSizeChange(Number(e.target.value))
          }}
          className={styles.pageSizeSelect}
          disabled={disabled}
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
        Showing {rowsOnPage} of {totalRows} rows
      </span>
    </div>
  )
}
