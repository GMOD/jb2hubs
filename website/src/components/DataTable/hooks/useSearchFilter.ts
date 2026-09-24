import { useMemo } from 'react'

import { useUrlState } from '../../../hooks/useUrlState.ts'
import { matchesAllTerms, searchTerms } from '../../../lib/searchTerms.ts'

import type { RowData } from './useTableColumns.tsx'

function getSearchableText(row: RowData) {
  return `${row.commonName} ${row.scientificName} ${row.ncbiAssemblyName} ${row.accession} ${row.submitterOrg}`
}

export function useSearchFilter(rows: RowData[]) {
  const [searchQuery, setSearchQuery] = useUrlState('search', '')

  const filteredRows = useMemo(() => {
    const terms = searchTerms(searchQuery)
    return terms.length === 0
      ? rows
      : rows.filter(row => matchesAllTerms(getSearchableText(row), terms))
  }, [rows, searchQuery])

  return { searchQuery, setSearchQuery, filteredRows }
}
