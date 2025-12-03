import { useEffect, useMemo, useState } from 'react'

import { filterCategories } from '../utils/filterCategories.ts'
import { notEmpty } from '../utils.ts'

import type { RowData } from './useTableColumns.tsx'

export function useCategoryFilter(rows: RowData[]) {
  const [filterOption, setFilterOption] = useState('all')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const filter = params.get('filter')
    // Ensure filter is a string before passing it to setFilterOption
    setFilterOption(filterCategories[filter!] ? filter! : 'all')
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (filterOption && filterOption !== 'all') {
        params.set('filter', filterOption)
      } else {
        params.delete('filter')
      }
      window.history.replaceState(
        null,
        '',
        `?${params.toString()}${window.location.hash}`,
      )
    }
  }, [filterOption])

  const filteredRows = useMemo(() => {
    const validRows = rows.filter(notEmpty).filter(f => f.accession)

    switch (filterOption) {
      case 'all': {
        return validRows
      }
      case 'refseq': {
        return validRows.filter(r => r.accession.startsWith('GCF_'))
      }
      case 'genbank': {
        return validRows.filter(r => r.accession.startsWith('GCA_'))
      }
      case 'designatedReference': {
        return validRows.filter(
          r => r.ncbiRefSeqCategory === 'reference genome',
        )
      }
      case 'hidesuppressed': {
        return validRows.filter(r => !r.suppressed)
      }
      default: {
        return validRows
      }
    }
  }, [rows, filterOption])

  return { filterOption, setFilterOption, filteredRows }
}
