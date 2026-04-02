import type { ColumnDef, RowData } from '../hooks/useTableColumns.tsx'

interface TableBodyProps {
  columns: ColumnDef[]
  rows: RowData[]
}

export default function TableBody({ columns, rows }: TableBodyProps) {
  return (
    <tbody>
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
