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
  // The th stays a column header (aria-sort lives there); the control inside it
  // is a real button, so it is focusable and keyboard-operable on its own.
  return (
    <thead>
      <tr>
        {columns.map(col => {
          const canSort = sortable && col.enableSorting !== false
          return (
            <th
              key={col.id}
              scope="col"
              aria-sort={
                canSort ? getAriaSortValue(col.id, sortId, sortDesc) : undefined
              }
            >
              {canSort ? (
                <button
                  type="button"
                  className={styles.sortButton}
                  onClick={() => {
                    handleSort(col.id)
                  }}
                >
                  {col.header} {sortId === col.id ? (sortDesc ? '↓' : '↑') : ''}
                </button>
              ) : (
                col.header
              )}
            </th>
          )
        })}
      </tr>
    </thead>
  )
}
