import { useCallback, useEffect, useMemo, useState } from 'react'

import uFuzzy from '@leeoniya/ufuzzy'

import type { RowData } from './useTableColumns.tsx'

// Define a new interface that extends RowData and includes _searchText
interface SearchableRowData extends RowData {
  _searchText: string
}

// Configure ufuzzy for optimal performance
const uf = new uFuzzy({
  intraMode: 0, // single-char insertions
  intraIns: 0, // allow insertions
  intraSub: 0, // allow substitutions
  intraTrn: 0, // allow transpositions
  intraDel: 0, // allow deletions
  interLft: 0, // no left leeway
  interRgt: 0, // no right leeway
})

// Pre-computed search strings for better performance
const getSearchableText = (row: RowData): string => {
  const {
    commonName,
    scientificName,
    ncbiAssemblyName,
    accession,
    submitterOrg,
  } = row
  return `${commonName} ${scientificName} ${ncbiAssemblyName} ${accession} ${submitterOrg}`
}

function getSearchFromURL() {
  const params = new URLSearchParams(window.location.search)
  return params.get('search') ?? ''
}

export function useSearchFilter(rows: RowData[]) {
  const [searchQuery, setSearchQueryState] = useState(getSearchFromURL)

  // Memoize processed rows and search haystack for better performance
  const { processedRows, searchHaystack } = useMemo(() => {
    const processedRows: SearchableRowData[] = rows.map(row => ({
      ...row,
      _searchText: getSearchableText(row),
    }))

    const searchHaystack = processedRows.map(row => row._searchText)

    return { processedRows, searchHaystack }
  }, [rows])

  const filteredRows = useMemo(() => {
    // If no search query, return all rows
    const query = (searchQuery || '').trim()
    if (!query) {
      return rows
    }

    // Use ufuzzy for fuzzy search
    const indexes = uf.filter(searchHaystack, query)

    // Map back to rows and filter out any undefined results
    return (
      indexes
        ?.map(idx => processedRows[idx])
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        .filter((row): row is SearchableRowData => row !== undefined)
        .map((row): RowData => {
          // Destructure to remove _searchText before returning as RowData
          const { _searchText, ...rest } = row
          return rest
        }) ?? []
    )
  }, [rows, processedRows, searchHaystack, searchQuery])

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
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return {
    searchQuery,
    setSearchQuery: handleSearchChange,
    filteredRows,
  }
}
