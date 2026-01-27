import React, { useMemo, useState } from 'react'

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'

import list from '../list.json'
import Container from './ui/react-wrappers/Container.tsx'
import StyledLink from './ui/react-wrappers/StyledLink.tsx'

import type { SortingState } from '@tanstack/react-table'

import '../styles/common-table.css'

interface UCSCGenome {
  scientificName: string
  organism: string
  description: string
  orderKey: number
}

interface RowData {
  name: string
  scientificName: string
  organism: string
  description: string
  jbrowseLink: string
  ucscLink2: string
  orderKey: number
}

export default function UCSCTable() {
  const [sorting, setSorting] = useState<SortingState>([])

  const data = useMemo(() => {
    return Object.entries(list.ucscGenomes as Record<string, UCSCGenome>).map(
      ([key, val]) => ({
        name: key,
        scientificName: val.scientificName,
        organism: val.organism,
        description: val.description,
        jbrowseLink: `https://jbrowse.org/code/jb2/latest/?config=/ucsc/${key}/config.json`,
        ucscLink2: `https://genome.ucsc.edu/cgi-bin/hgTracks?db=${key}`,
        orderKey: val.orderKey,
      }),
    )
  }, [])

  // Define columns for TanStack Table
  const columnHelper = createColumnHelper<RowData>()

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: info => (
          <div>
            {info.getValue()} (
            <StyledLink href={`/ucsc/${info.getValue()}`}>info</StyledLink>)
          </div>
        ),
      }),
      columnHelper.accessor('scientificName', {
        header: 'Scientific name',
        cell: info => info.getValue(),
      }),
      columnHelper.accessor('organism', {
        header: 'Organism',
        cell: info => info.getValue(),
      }),
      columnHelper.accessor('description', {
        header: 'Description',
        cell: info => info.getValue(),
      }),
      columnHelper.accessor('jbrowseLink', {
        header: 'JBrowse',
        cell: info => <StyledLink href={info.getValue()}>JBrowse</StyledLink>,
      }),
      columnHelper.accessor('ucscLink2', {
        header: 'UCSC',
        cell: info => <StyledLink href={info.getValue()}>UCSC</StyledLink>,
      }),
    ],
    [columnHelper],
  )

  // Create table instance
  const table = useReactTable({
    data: data.sort((a, b) => a.orderKey - b.orderKey),
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <Container>
      <h1>Main genome browsers</h1>
      <div>
        <p>
          This page contains a list of all the &quot;main&quot; genomes from the
          UCSC genome browser, converted into a format that JBrowse 2 can load
        </p>
        <p>
          <StyledLink href="https://jbrowse.org/code/jb2/latest/?config=/ucsc/all.json">
            Click here
          </StyledLink>{' '}
          for single JBrowse 2 instance containing ALL the species
        </p>
      </div>
      <table>
        <thead>
          {table.getHeaderGroups().map(group => (
            <tr key={group.id}>
              {group.headers.map(header => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className={header.column.getCanSort() ? 'cursor-pointer' : ''}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  {{
                    asc: ' ↑',
                    desc: ' ↓',
                  }[header.column.getIsSorted() as string] ?? ''}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id}>
              {row.getVisibleCells().map(cell => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Container>
  )
}
