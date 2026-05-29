import { useMemo } from 'react'

import { useUrlState } from '../../../hooks/useUrlState.ts'

import type { RowData } from './useTableColumns.tsx'

function getSearchableText(row: RowData) {
  return `${row.commonName} ${row.scientificName} ${row.ncbiAssemblyName} ${row.accession} ${row.submitterOrg}`.toLowerCase()
}

export function useSearchFilter(rows: RowData[]) {
  const [searchQuery, setSearchQuery] = useUrlState('search', '')

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return rows
    }
    return rows.filter(row => getSearchableText(row).includes(query))
  }, [rows, searchQuery])

  return { searchQuery, setSearchQuery, filteredRows }
}
