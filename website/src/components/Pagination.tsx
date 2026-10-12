import { useId } from 'react'

import { PAGE_SIZES } from '../utils/paginate.ts'
import styles from './DataTable.module.css'

import type { RefObject } from 'react'

interface PaginationProps {
  pageIndex: number
  pageSize: number
  pageCount: number
  totalRows: number
  rowsOnPage: number
  onPageChange: (index: number) => void
  onPageSizeChange: (size: number) => void
  disabled?: boolean
  // brought back into view on a page change, since the pager sits below the
  // rows it pages
  tableRef?: RefObject<HTMLElement | null>
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
  tableRef,
}: PaginationProps) {
  // The label/select pair needs a document-unique id, which a literal is not:
  // two paginated tables on one page would give the browser two "pageSize"
  // elements and the label would point at whichever came first.
  const pageSizeId = useId()
  const goTo = (index: number) => {
    onPageChange(index)
    const table = tableRef?.current
    if (table && table.getBoundingClientRect().top < 0) {
      table.scrollIntoView()
    }
  }
  return (
    <div className={styles.paginationContainer}>
      <button
        className={styles.paginationButton}
        onClick={() => {
          goTo(0)
        }}
        disabled={disabled || pageIndex === 0}
        aria-label="First page"
      >
        {'<<'}
      </button>
      <button
        className={styles.paginationButton}
        onClick={() => {
          goTo(pageIndex - 1)
        }}
        disabled={disabled || pageIndex === 0}
        aria-label="Previous page"
      >
        {'<'}
      </button>
      <span className={styles.pageInfo}>
        Page{' '}
        <strong>
          {(pageIndex + 1).toLocaleString()} of {pageCount.toLocaleString()}
        </strong>
      </span>
      <button
        className={styles.paginationButton}
        onClick={() => {
          goTo(pageIndex + 1)
        }}
        disabled={disabled || pageIndex >= pageCount - 1}
        aria-label="Next page"
      >
        {'>'}
      </button>
      <button
        className={styles.paginationButton}
        onClick={() => {
          goTo(pageCount - 1)
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
          {PAGE_SIZES.map(size => (
            <option
              key={size}
              value={size}
            >
              {size}
            </option>
          ))}
        </select>
        <span>rows</span>
      </div>
      <span
        className={styles.rowCount}
        role="status"
      >
        Showing {rowsOnPage.toLocaleString()} of {totalRows.toLocaleString()}{' '}
        rows
      </span>
    </div>
  )
}
