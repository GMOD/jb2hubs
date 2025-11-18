import { useCallback, useEffect, useMemo } from 'react'

import uFuzzy from '@leeoniya/ufuzzy'
import { useQueryState } from 'nuqs'

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

export function useSearchFilter(rows: RowData[]) {
  // Use nuqs to manage search query in URL
  const [searchQuery, setSearchQuery] = useQueryState('search', {
    defaultValue: '',
    history: 'push',
    throttleMs: 300, // Debounce URL updates
  })

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

  const handleSearchChange = useCallback(
    (value: string) => {
      void setSearchQuery(value || null)
    },
    [setSearchQuery],
  )

  return {
    searchQuery: searchQuery || '',
    setSearchQuery: handleSearchChange,
    filteredRows,
  }
}
