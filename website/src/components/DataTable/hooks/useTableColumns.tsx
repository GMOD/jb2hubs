import { useMemo } from 'react'

import { genarkConfigPath, jbrowseUrl } from '../../../config/jbrowse.ts'
import OrangeStar from '../../OrangeStar.tsx'
import RedX from '../../RedX.tsx'
import { IS_REFERENCE, IS_SUPPRESSED } from '../hubRow.ts'
import { statusOrder } from '../utils.ts'
import styles from './useTableColumns.module.css'

import type { RowData } from '../hubRow.ts'

export type { RowData }

export interface ColumnDef {
  id: string
  header: string
  cell: (row: RowData) => React.ReactNode
  enableSorting?: boolean
  sortValue?: (row: RowData) => string | number
  meta?: { extra?: boolean }
}

export function useTableColumns({
  showAllColumns,
}: {
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
            {row.commonName}{' '}
            <a href={`/accession/${row.accession}`}>(info)</a>{' '}
          </>
        ),
      },
      {
        id: 'ncbiStatus',
        header: 'NCBI status',
        enableSorting: true,
        // Reference genomes first, suppressed last.
        sortValue: row => {
          if (row.ncbiStatus & IS_REFERENCE) {
            return 2
          }
          return row.ncbiStatus & IS_SUPPRESSED ? 0 : 1
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
        enableSorting: false,
        cell: row => (
          <a href={jbrowseUrl(genarkConfigPath(row.accession))}>JBrowse</a>
        ),
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
        cell: row => row.scientificName,
      },
      {
        id: 'ncbiAssemblyName',
        header: 'NCBI assembly name',
        enableSorting: true,
        sortValue: row => row.ncbiAssemblyName,
        cell: row => row.ncbiAssemblyName,
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
        cell: row => <a href={`/taxonomy/${row.taxonId}`}>{row.taxonId}</a>,
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
  }, [showAllColumns])

  return { columns }
}
