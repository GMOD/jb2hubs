import { useCallback, useEffect, useMemo, useState } from 'react'

import type { RowData } from './useTableColumns.tsx'

function getSearchFromURL() {
  const params = new URLSearchParams(window.location.search)
  return params.get('search') ?? ''
}

function getSearchableText(row: RowData) {
  return `${row.commonName} ${row.scientificName} ${row.ncbiAssemblyName} ${row.accession} ${row.submitterOrg}`.toLowerCase()
}

export function useSearchFilter(rows: RowData[]) {
  const [searchQuery, setSearchQueryState] = useState(getSearchFromURL)

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return rows
    }
    return rows.filter(row => getSearchableText(row).includes(query))
  }, [rows, searchQuery])

  const handleSearchChange = useCallback((value: string) => {
    setSearchQueryState(value)
    const url = new URL(window.location.href)
    if (value) {
      url.searchParams.set('search', value)
    } else {
      url.searchParams.delete('search')
    }
    window.history.pushState({}, '', url.toString())
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      setSearchQueryState(getSearchFromURL())
    }
    window.addEventListener('popstate', handlePopState)
    return () => { window.removeEventListener('popstate', handlePopState) }
  }, [])

  return {
    searchQuery,
    setSearchQuery: handleSearchChange,
    filteredRows,
  }
}
