import { genarkConfigPath, jbrowseUrl } from '../../config/jbrowse.ts'
import { IS_REFERENCE, IS_SUPPRESSED } from '../../lib/searchIndex.ts'
import OrangeStar from '../OrangeStar.tsx'
import RedX from '../RedX.tsx'
import { statusOrder } from './utils.ts'

import type { RowData } from './hubRow.ts'

export interface ColumnDef {
  id: string
  header: string
  cell: (row: RowData) => React.ReactNode
  sortValue?: (row: RowData) => string | number
  meta?: { extra?: boolean }
}

const ALL_COLUMNS: ColumnDef[] = [
  {
    id: 'commonName',
    header: 'Common Name',
    sortValue: row => row.commonName,
    cell: row => (
      <>
        {row.commonName} <a href={`/accession/${row.accession}`}>(info)</a>{' '}
      </>
    ),
  },
  {
    id: 'ncbiStatus',
    header: 'NCBI status',
    // the first click, ascending, puts references first and suppressed last
    sortValue: row => {
      if (row.ncbiStatus & IS_REFERENCE) {
        return 0
      }
      return row.ncbiStatus & IS_SUPPRESSED ? 2 : 1
    },
    cell: row => (
      <>
        {row.ncbiStatus & IS_REFERENCE ? <OrangeStar /> : null}
        {row.ncbiStatus & IS_SUPPRESSED ? <RedX /> : null}
      </>
    ),
  },
  {
    id: 'jbrowseLink',
    header: 'JBrowse',
    cell: row => (
      <a href={jbrowseUrl(genarkConfigPath(row.accession))}>JBrowse</a>
    ),
  },
  {
    id: 'assemblyStatus',
    header: 'Assembly status',
    sortValue: row => statusOrder[row.assemblyStatus.toLowerCase()] ?? 999,
    cell: row => (
      <span style={{ whiteSpace: 'nowrap' }}>{row.assemblyStatus}</span>
    ),
  },
  {
    id: 'seqReleaseDate',
    header: 'Release date',
    sortValue: row => row.seqReleaseDate,
    cell: row => row.seqReleaseDate,
  },
  {
    id: 'scientificName',
    header: 'Scientific name',
    sortValue: row => row.scientificName,
    cell: row => row.scientificName,
  },
  {
    id: 'ncbiAssemblyName',
    header: 'NCBI assembly name',
    sortValue: row => row.ncbiAssemblyName,
    cell: row => row.ncbiAssemblyName,
  },
  {
    id: 'accession',
    header: 'Accession',
    sortValue: row => row.accession,
    cell: row => row.accession,
  },
  {
    id: 'taxonId',
    header: 'Taxonomy ID',
    sortValue: row => row.taxonId,
    meta: { extra: true },
    cell: row => <a href={`/taxonomy/${row.taxonId}`}>{row.taxonId}</a>,
  },
  {
    id: 'submitterOrg',
    header: 'Submitter',
    sortValue: row => row.submitterOrg,
    meta: { extra: true },
    cell: row => row.submitterOrg,
  },
]

const DEFAULT_COLUMNS = ALL_COLUMNS.filter(col => !col.meta?.extra)

export function tableColumns(showAllColumns: boolean) {
  return showAllColumns ? ALL_COLUMNS : DEFAULT_COLUMNS
}
