import { useMemo } from 'react'

import {
  jbrowseUrl,
  ucscAllConfigPath,
  ucscConfigPath,
} from '../config/jbrowse.ts'
import list from '../list.json'
import TableHeader from './DataTable/components/TableHeader.tsx'
import { useTableSort } from './DataTable/hooks/useTableSort.ts'
import { makeComparator } from './DataTable/utils.ts'
import styles from './UCSCTable.module.css'
import { useUrlState } from '../hooks/useUrlState.ts'

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

// The two link columns render the same word in every row, so sorting by them
// only shuffles ties.
const columns = [
  { id: 'name', header: 'Name', enableSorting: true },
  { id: 'scientificName', header: 'Scientific name', enableSorting: true },
  { id: 'organism', header: 'Organism', enableSorting: true },
  { id: 'description', header: 'Description', enableSorting: true },
  { id: 'jbrowseLink', header: 'JBrowse', enableSorting: false },
  { id: 'ucscLink', header: 'UCSC', enableSorting: false },
] as const

export default function UCSCTable() {
  const { sortId: rawSortId, sortDesc, handleSort } = useTableSort()
  const [search, setSearch] = useUrlState('search', '')
  // Validate the URL-supplied sort against the sortable columns so `sortId`
  // stays a typed ColId (or '') without a cast, and ?sort=jbrowseLink can't
  // order the table by a column whose header refuses to sort it.
  const sortId =
    columns.find(col => col.id === rawSortId && col.enableSorting)?.id ?? ''

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
    <>
      <h1>Main genome browsers</h1>
      <div>
        <p>
          This page contains a list of all the &quot;main&quot; genomes from the
          UCSC genome browser, converted into a format that JBrowse 2 can load
        </p>
        <p>
          <a href={jbrowseUrl(ucscAllConfigPath())}>Click here</a> for single
          JBrowse 2 instance containing ALL the species
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
      <div className="table-scroll">
        <table>
          <TableHeader
            columns={[...columns]}
            handleSort={handleSort}
            sortId={sortId}
            sortDesc={sortDesc}
          />
          <tbody>
            {sortedRows.map(row => (
              <tr key={row.name}>
                <td>
                  {row.name} (<a href={`/ucsc/${row.name}`}>info</a>)
                </td>
                <td>{row.scientificName}</td>
                <td>{row.organism}</td>
                <td>{row.description}</td>
                <td>
                  <a href={row.jbrowseLink}>JBrowse</a>
                </td>
                <td>
                  <a href={row.ucscLink}>UCSC</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
