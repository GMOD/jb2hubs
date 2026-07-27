import { useMemo } from 'react'

import {
  jbrowseUrl,
  ucscAllConfigPath,
  ucscConfigPath,
} from '../config/jbrowse.ts'
import list from '../list.json'
import { useTableSort } from './DataTable/hooks/useTableSort.ts'
import { makeComparator } from './DataTable/utils.ts'
import styles from './UCSCTable.module.css'
import { useUrlState } from '../hooks/useUrlState.ts'
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

export default function UCSCTable() {
  const { sortId: rawSortId, sortDesc, handleSort } = useTableSort()
  const [search, setSearch] = useUrlState('search', '')
  // Validate the URL-supplied sort against the known columns so `sortId` stays
  // a typed ColId (or '') without a cast.
  const sortId = columns.find(col => col.id === rawSortId)?.id ?? ''

  const data = useMemo<RowData[]>(() => {
    return Object.entries(list.ucscGenomes as Record<string, UCSCGenome>)
      .map(([key, val]) => ({
        name: key,
        scientificName: val.scientificName,
        organism: val.organism,
        description: val.description,
        jbrowseLink: jbrowseUrl(ucscConfigPath(key)),
        ucscLink: `https://genome.ucsc.edu/cgi-bin/hgTracks?db=${key}`,
        orderKey: val.orderKey,
      }))
      .sort((a, b) => a.orderKey - b.orderKey)
  }, [])

  const matchingRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query
      ? data.filter(row =>
          `${row.name} ${row.scientificName} ${row.organism} ${row.description}`
            .toLowerCase()
            .includes(query),
        )
      : data
  }, [data, search])

  const sortedRows = useMemo(
    () =>
      sortId
        ? matchingRows.toSorted(makeComparator(row => row[sortId], sortDesc))
        : matchingRows,
    [matchingRows, sortId, sortDesc],
  )

  return (
    <Container>
      <h1>Main genome browsers</h1>
      <div>
        <p>
          This page contains a list of all the &quot;main&quot; genomes from the
          UCSC genome browser, converted into a format that JBrowse 2 can load
        </p>
        <p>
          <StyledLink href={jbrowseUrl(ucscAllConfigPath())}>
            Click here
          </StyledLink>{' '}
          for single JBrowse 2 instance containing ALL the species
        </p>
      </div>
      <div className={styles.searchRow}>
        <input
          type="search"
          value={search}
          placeholder="Filter by db name, species, or description…"
          aria-label="Filter genomes"
          className={styles.searchInput}
          onChange={e => {
            setSearch(e.target.value)
          }}
        />
        <span className={styles.count}>
          {sortedRows.length === data.length
            ? `${data.length} genomes`
            : `${sortedRows.length} of ${data.length} genomes`}
        </span>
      </div>
      <table>
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.id}
                scope="col"
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                aria-sort={
                  sortId === col.id
                    ? sortDesc
                      ? 'descending'
                      : 'ascending'
                    : 'none'
                }
                onClick={() => {
                  handleSort(col.id)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleSort(col.id)
                  }
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
