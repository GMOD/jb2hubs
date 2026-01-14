import { flexRender } from '@tanstack/react-table'

import styles from './TableHeader.module.css'

import type { HeaderGroup, SortDirection } from '@tanstack/react-table'
import type { KeyboardEvent } from 'react'

interface TableHeaderProps<TData> {
  headerGroups: HeaderGroup<TData>[]
  handleSort: (id: string) => void
  sortState: string
  sortDirectionPre: SortDirection | false | '' // Allow empty string
}

function getAriaSortValue(
  headerId: string,
  sortState: string,
  sortDirectionPre: SortDirection | false | '',
): 'ascending' | 'descending' | 'none' {
  if (sortState !== headerId) return 'none'
  if (sortDirectionPre === 'asc') return 'ascending'
  if (sortDirectionPre === 'desc') return 'descending'
  return 'none'
}

export default function TableHeader<TData>({
  headerGroups,
  handleSort,
  sortState,
  sortDirectionPre,
}: TableHeaderProps<TData>) {
  const handleKeyDown = (e: KeyboardEvent, headerId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleSort(headerId)
    }
  }

  return (
    <thead>
      {headerGroups.map(headerGroup => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map(header => {
            const canSort = header.column.getCanSort()
            return (
              <th
                key={header.id}
                className={canSort ? styles.cursorPointer : ''}
                onClick={
                  canSort
                    ? () => {
                        handleSort(header.id)
                      }
                    : undefined
                }
                onKeyDown={
                  canSort ? e => handleKeyDown(e, header.id) : undefined
                }
                tabIndex={canSort ? 0 : undefined}
                role={canSort ? 'button' : undefined}
                aria-sort={
                  canSort
                    ? getAriaSortValue(header.id, sortState, sortDirectionPre)
                    : undefined
                }
              >
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}{' '}
                {canSort
                  ? sortState === header.id
                    ? sortDirectionPre === 'asc'
                      ? '↑'
                      : '↓'
                    : ''
                  : ''}
              </th>
            )
          })}
        </tr>
      ))}
    </thead>
  )
}
