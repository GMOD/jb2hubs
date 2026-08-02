import type { KeyboardEvent } from 'react'

import styles from './TableHeader.module.css'

// Only what the header itself reads, so any table with sortable columns can use
// this — the full ColumnDef (which also carries `cell`/`sortValue`) satisfies it.
export interface SortableColumn {
  id: string
  header: string
  enableSorting?: boolean
}

interface TableHeaderProps {
  columns: SortableColumn[]
  handleSort: (id: string) => void
  sortId: string
  sortDesc: boolean
  // Sorting a partially-loaded table would silently reorder only the first page.
  sortable?: boolean
}

function getAriaSortValue(
  colId: string,
  sortId: string,
  sortDesc: boolean,
): 'ascending' | 'descending' | 'none' {
  if (sortId !== colId) {
    return 'none'
  }
  return sortDesc ? 'descending' : 'ascending'
}

export default function TableHeader({
  columns,
  handleSort,
  sortId,
  sortDesc,
  sortable = true,
}: TableHeaderProps) {
  const handleKeyDown = (e: KeyboardEvent, colId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleSort(colId)
    }
  }

  return (
    <thead>
      <tr>
        {columns.map(col => {
          const canSort = sortable && col.enableSorting !== false
          return (
            <th
              key={col.id}
              scope="col"
              className={canSort ? styles.cursorPointer : ''}
              onClick={
                canSort
                  ? () => {
                      handleSort(col.id)
                    }
                  : undefined
              }
              onKeyDown={
                canSort
                  ? e => {
                      handleKeyDown(e, col.id)
                    }
                  : undefined
              }
              tabIndex={canSort ? 0 : undefined}
              role={canSort ? 'button' : undefined}
              aria-sort={
                canSort ? getAriaSortValue(col.id, sortId, sortDesc) : undefined
              }
            >
              {col.header}{' '}
              {canSort && sortId === col.id ? (sortDesc ? '↓' : '↑') : ''}
            </th>
          )
        })}
      </tr>
    </thead>
  )
}
