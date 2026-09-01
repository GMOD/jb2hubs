import { useMemo } from 'react'

import { useUrlState } from '../../../hooks/useUrlState.ts'
import { IS_REFERENCE, IS_SUPPRESSED } from '../../../lib/searchIndex.ts'
import { filterCategories } from '../utils/filterCategories.ts'

import type { RowData } from '../hubRow.ts'

// Every producer of RowData already drops accession-less records —
// generateHubData.ts before encoding, categoryTable/subtreeTable before
// rendering — so this only has to apply the chosen filter, not re-validate
// 22K rows on each change.
export function useCategoryFilter(rows: RowData[]) {
  const [raw, setRaw] = useUrlState('filter', 'all')
  const filterOption = filterCategories[raw] ? raw : 'all'

  const filteredRows = useMemo(() => {
    switch (filterOption) {
      case 'refseq':
        return rows.filter(r => r.accession.startsWith('GCF_'))
      case 'genbank':
        return rows.filter(r => r.accession.startsWith('GCA_'))
      case 'designatedReference':
        return rows.filter(r => r.ncbiStatus & IS_REFERENCE)
      case 'hidesuppressed':
        return rows.filter(r => !(r.ncbiStatus & IS_SUPPRESSED))
      default:
        return rows
    }
  }, [rows, filterOption])

  return { filterOption, setFilterOption: setRaw, filteredRows }
}
