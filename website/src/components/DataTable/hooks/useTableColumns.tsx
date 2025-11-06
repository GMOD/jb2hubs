import { useMemo } from 'react'

import { createColumnHelper } from '@tanstack/react-table'

import styles from './useTableColumns.module.css'
import OrangeStar from '../../OrangeStar.tsx'
import RedX from '../../RedX.tsx'
import { highlightText } from '../utils/highlightText.tsx'
import { statusOrder } from '../utils.ts'

// Define the shape of the row data
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
  _searchText?: string // Add _searchText
}

export function useTableColumns({
  searchQuery = '',
  showAllColumns,
}: {
  searchQuery?: string
  showAllColumns: boolean
}) {
  const columnHelper = createColumnHelper<RowData>()

  const columns = useMemo(() => {
    const allColumns = [
      columnHelper.accessor('commonName', {
        header: 'Common Name',
        cell: info => (
          <>
            {highlightText(info.getValue() || '', searchQuery)}{' '}
            <a href={`/accession/${info.row.original.accession}`}>(info)</a>{' '}
            {info.row.original.ncbiRefSeqCategory === 'reference genome' ? (
              <OrangeStar />
            ) : null}
            {info.row.original.suppressed ? <RedX /> : null}
          </>
        ),
        enableSorting: true,
      }),
      columnHelper.accessor('jbrowseLink', {
        header: 'JBrowse',
        cell: info => <a href={info.getValue()}>JBrowse</a>,
        enableSorting: false,
      }),
      columnHelper.accessor('assemblyStatus', {
        header: 'Assembly status',
        enableSorting: true,
        cell: info => (
          <div className={styles.whitespaceNowrap}>{info.getValue()}</div>
        ),
        sortingFn: (rowA, rowB) => {
          const a = statusOrder[rowA.original.assemblyStatus] || 999
          const b = statusOrder[rowB.original.assemblyStatus] || 999
          return a - b
        },
      }),
      columnHelper.accessor('seqReleaseDate', {
        header: 'Release date',
        cell: info => info.getValue().replace('00:00', ''),
        enableSorting: true,
      }),
      columnHelper.accessor('scientificName', {
        header: 'Scientific name',
        cell: info => highlightText(info.getValue() || '', searchQuery),
        enableSorting: true,
      }),
      columnHelper.accessor('ncbiAssemblyName', {
        header: 'NCBI assembly name',
        cell: info => highlightText(info.getValue() || '', searchQuery),
        enableSorting: true,
      }),
      columnHelper.accessor('accession', {
        header: 'Accession',
        enableSorting: true,
      }),
      columnHelper.accessor('taxonId', {
        header: 'Taxonomy ID',
        cell: info => (
          <a href={`https://genomes.jbrowse.org/taxonomy/${info.getValue()}/`}>
            {info.getValue()}
          </a>
        ),
        enableSorting: true,
        meta: { extra: true },
      }),
      columnHelper.accessor('submitterOrg', {
        header: 'Submitter',
        enableSorting: true,
        meta: { extra: true },
      }),
    ]
    if (showAllColumns) {
      return allColumns
    }
    return allColumns.filter(col => !(col as any).meta?.extra)
  }, [columnHelper, searchQuery, showAllColumns])

  return { columns }
}
