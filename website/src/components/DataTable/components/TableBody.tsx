import type { ColumnDef, RowData } from '../hooks/useTableColumns.tsx'

interface TableBodyProps {
  columns: ColumnDef[]
  rows: RowData[]
  // one row across the table when `rows` is empty
  emptyMessage: string
}

export default function TableBody({
  columns,
  rows,
  emptyMessage,
}: TableBodyProps) {
  return (
    <tbody>
      {rows.length === 0 && (
        <tr>
          <td colSpan={columns.length}>{emptyMessage}</td>
        </tr>
      )}
      {rows.map(row => (
        <tr key={row.accession}>
          {columns.map(col => (
            <td key={col.id}>{col.cell(row)}</td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}
