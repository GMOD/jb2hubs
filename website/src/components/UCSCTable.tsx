import '../styles/common-table.css'

import { useMemo } from 'react'

import { jbrowseUrl, ucscAllConfigPath } from '../config/jbrowse.ts'
import { useUrlState } from '../hooks/useUrlState.ts'
import TableHeader from './DataTable/components/TableHeader.tsx'
import { useTableSort } from './DataTable/hooks/useTableSort.ts'
import { makeComparator } from './DataTable/utils.ts'
import styles from './UCSCTable.module.css'

// Built by pages/ucsc/index.astro from list.json, which is 144KB the island has
// no other use for.
export interface UcscRow {
  name: string
  scientificName: string
  organism: string
  description: string
  // Off the description ("Dec. 2013 (GRCh38/hg38)"), which is what that column
  // sorts by: its text would order by month name.
  year: number
  jbrowseLink: string
  ucscLink: string
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

function sortValue(row: UcscRow, id: (typeof columns)[number]['id']) {
  return id === 'description' ? row.year : row[id]
}

export default function UCSCTable({ rows }: { rows: UcscRow[] }) {
  const { sortId: rawSortId, sortDesc, handleSort } = useTableSort()
  const [search, setSearch] = useUrlState('search', '')
  // Validate the URL-supplied sort against the sortable columns so `sortId`
  // stays a typed ColId (or '') without a cast, and ?sort=jbrowseLink can't
  // order the table by a column whose header refuses to sort it.
  const sortId =
    columns.find(col => col.id === rawSortId && col.enableSorting)?.id ?? ''

  const matchingRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query
      ? rows.filter(row =>
          `${row.name} ${row.scientificName} ${row.organism} ${row.description}`
            .toLowerCase()
            .includes(query),
        )
      : rows
  }, [rows, search])

  const sortedRows = useMemo(
    () =>
      sortId
        ? matchingRows.toSorted(
            makeComparator(row => sortValue(row, sortId), sortDesc),
          )
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
          {sortedRows.length === rows.length
            ? `${rows.length} genomes`
            : `${sortedRows.length} of ${rows.length} genomes`}
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
