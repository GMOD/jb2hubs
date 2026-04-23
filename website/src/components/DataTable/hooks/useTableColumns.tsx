import { useMemo } from 'react'

import styles from './useTableColumns.module.css'
import OrangeStar from '../../OrangeStar.tsx'
import RedX from '../../RedX.tsx'
import { highlightText } from '../utils/highlightText.tsx'
import { statusOrder } from '../utils.ts'

export interface RowData {
  commonName: string
  accession: string
  ncbiRefSeqCategory: string
  suppressed: boolean
  jbrowseLink: string
  assemblyStatus: string
  seqReleaseDate: string
  scientificName: string
  ncbiAssemblyName: string
  taxonId: string
  submitterOrg: string
  _searchText?: string
}

export interface ColumnDef {
  id: string
  header: string
  cell: (row: RowData) => React.ReactNode
  enableSorting?: boolean
  sortValue?: (row: RowData) => string | number
  meta?: { extra?: boolean }
}

export function useTableColumns({
  searchQuery = '',
  showAllColumns,
}: {
  searchQuery?: string
  showAllColumns: boolean
}) {
  const columns = useMemo<ColumnDef[]>(() => {
    const allColumns: ColumnDef[] = [
      {
        id: 'commonName',
        header: 'Common Name',
        enableSorting: true,
        sortValue: row => row.commonName,
        cell: row => (
          <>
            {highlightText(row.commonName || '', searchQuery)}{' '}
            <a href={`/accession/${row.accession}`}>(info)</a>{' '}
          </>
        ),
      },
      {
        id: 'ncbiStatus',
        header: 'NCBI status',
        enableSorting: true,
        sortValue: row => {
          if (row.ncbiRefSeqCategory === 'reference genome') {
            return 1
          }
          if (row.suppressed) {
            return 2
          }
          return 0
        },
        cell: row => (
          <>
            {row.ncbiRefSeqCategory === 'reference genome' ? (
              <OrangeStar />
            ) : null}
            {row.suppressed ? <RedX /> : null}
          </>
        ),
      },
      {
        id: 'jbrowseLink',
        header: 'JBrowse',
        enableSorting: false,
        cell: row => <a href={row.jbrowseLink}>JBrowse</a>,
      },
      {
        id: 'assemblyStatus',
        header: 'Assembly status',
        enableSorting: true,
        sortValue: row => statusOrder[row.assemblyStatus.toLowerCase()] ?? 999,
        cell: row => (
          <div className={styles.whitespaceNowrap}>{row.assemblyStatus}</div>
        ),
      },
      {
        id: 'seqReleaseDate',
        header: 'Release date',
        enableSorting: true,
        sortValue: row => row.seqReleaseDate,
        cell: row => row.seqReleaseDate.replace('00:00', ''),
      },
      {
        id: 'scientificName',
        header: 'Scientific name',
        enableSorting: true,
        sortValue: row => row.scientificName,
        cell: row => highlightText(row.scientificName || '', searchQuery),
      },
      {
        id: 'ncbiAssemblyName',
        header: 'NCBI assembly name',
        enableSorting: true,
        sortValue: row => row.ncbiAssemblyName,
        cell: row => highlightText(row.ncbiAssemblyName || '', searchQuery),
      },
      {
        id: 'accession',
        header: 'Accession',
        enableSorting: true,
        sortValue: row => row.accession,
        cell: row => row.accession,
      },
      {
        id: 'taxonId',
        header: 'Taxonomy ID',
        enableSorting: true,
        sortValue: row => row.taxonId,
        meta: { extra: true },
        cell: row => (
          <a href={`https://genomes.jbrowse.org/taxonomy/${row.taxonId}/`}>
            {row.taxonId}
          </a>
        ),
      },
      {
        id: 'submitterOrg',
        header: 'Submitter',
        enableSorting: true,
        sortValue: row => row.submitterOrg,
        meta: { extra: true },
        cell: row => row.submitterOrg,
      },
    ]
    if (showAllColumns) {
      return allColumns
    }
    return allColumns.filter(col => !col.meta?.extra)
  }, [searchQuery, showAllColumns])

  return { columns }
}
