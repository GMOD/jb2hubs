import { useMemo, useState } from 'react'

import list from '../list.json'
import Container from './ui/react-wrappers/Container.tsx'
import StyledLink from './ui/react-wrappers/StyledLink.tsx'

import '../styles/common-table.css'

interface RowData {
  name: string
  scientificName: string
  organism: string
  description: string
  jbrowseLink: string
  ucscLink: string
  orderKey: number
}

interface UCSCGenome {
  scientificName: string
  organism: string
  description: string
  orderKey: number
}

const columns = [
  { id: 'name', header: 'Name' },
  { id: 'scientificName', header: 'Scientific name' },
  { id: 'organism', header: 'Organism' },
  { id: 'description', header: 'Description' },
  { id: 'jbrowseLink', header: 'JBrowse' },
  { id: 'ucscLink', header: 'UCSC' },
] as const

type ColId = (typeof columns)[number]['id']

export default function UCSCTable() {
  const [sortId, setSortId] = useState<ColId | ''>('')
  const [sortDesc, setSortDesc] = useState(false)

  const data = useMemo<RowData[]>(() => {
    return Object.entries(list.ucscGenomes as Record<string, UCSCGenome>)
      .map(([key, val]) => ({
        name: key,
        scientificName: val.scientificName,
        organism: val.organism,
        description: val.description,
        jbrowseLink: `https://jbrowse.org/code/jb2/latest/?config=/ucsc/${key}/config.json`,
        ucscLink: `https://genome.ucsc.edu/cgi-bin/hgTracks?db=${key}`,
        orderKey: val.orderKey,
      }))
      .sort((a, b) => a.orderKey - b.orderKey)
  }, [])

  const sortedRows = useMemo(() => {
    if (!sortId) {
      return data
    }
    return [...data].sort((a, b) => {
      const aVal = a[sortId]
      const bVal = b[sortId]
      if (aVal < bVal) {
        return sortDesc ? 1 : -1
      }
      if (aVal > bVal) {
        return sortDesc ? -1 : 1
      }
      return 0
    })
  }, [data, sortId, sortDesc])

  const handleSort = (colId: ColId) => {
    if (sortId === colId) {
      if (!sortDesc) {
        setSortDesc(true)
      } else {
        setSortId('')
        setSortDesc(false)
      }
    } else {
      setSortId(colId)
      setSortDesc(false)
    }
  }

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
          <tr>
            {columns.map(col => (
              <th
                key={col.id}
                className="cursor-pointer"
                onClick={() => {
                  handleSort(col.id)
                }}
              >
                {col.header} {sortId === col.id ? (sortDesc ? '↓' : '↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map(row => (
            <tr key={row.name}>
              <td>
                {row.name} (
                <StyledLink href={`/ucsc/${row.name}`}>info</StyledLink>)
              </td>
              <td>{row.scientificName}</td>
              <td>{row.organism}</td>
              <td>{row.description}</td>
              <td>
                <StyledLink href={row.jbrowseLink}>JBrowse</StyledLink>
              </td>
              <td>
                <StyledLink href={row.ucscLink}>UCSC</StyledLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Container>
  )
}
