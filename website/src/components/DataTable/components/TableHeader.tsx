import type { KeyboardEvent } from 'react'

import styles from './TableHeader.module.css'

import type { ColumnDef } from '../hooks/useTableColumns.tsx'

interface TableHeaderProps {
  columns: ColumnDef[]
  handleSort: (id: string) => void
  sortId: string
  sortDesc: boolean
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
          const canSort = col.enableSorting !== false
          return (
            <th
              key={col.id}
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
