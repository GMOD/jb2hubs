import { useMemo } from 'react'

import { useUrlState } from '../../../hooks/useUrlState.ts'
import { IS_REFERENCE, IS_SUPPRESSED } from '../hubRow.ts'
import { filterCategories } from '../utils/filterCategories.ts'
import { notEmpty } from '../utils.ts'

import type { RowData } from '../hubRow.ts'

export function useCategoryFilter(rows: RowData[]) {
  const [raw, setRaw] = useUrlState('filter', 'all')
  const filterOption = filterCategories[raw] ? raw : 'all'

  const filteredRows = useMemo(() => {
    const validRows = rows.filter(notEmpty).filter(f => f.accession)
    switch (filterOption) {
      case 'refseq':
        return validRows.filter(r => r.accession.startsWith('GCF_'))
      case 'genbank':
        return validRows.filter(r => r.accession.startsWith('GCA_'))
      case 'designatedReference':
        return validRows.filter(r => r.ncbiStatus & IS_REFERENCE)
      case 'hidesuppressed':
        return validRows.filter(r => !(r.ncbiStatus & IS_SUPPRESSED))
      default:
        return validRows
    }
  }, [rows, filterOption])

  return { filterOption, setFilterOption: setRaw, filteredRows }
}
