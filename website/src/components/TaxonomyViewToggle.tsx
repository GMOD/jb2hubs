import { useEffect } from 'react'

import { useUrlState } from '../hooks/useUrlState.ts'
import DataTable from './DataTable.tsx'
import styles from './TaxonomyViewToggle.module.css'

import type { TableProps } from './DataTable.tsx'

interface Props {
  table: TableProps
  accessionCount: number
}

export default function TaxonomyViewToggle({ table, accessionCount }: Props) {
  const [viewParam, setView] = useUrlState('view', 'tree')
  const view = viewParam === 'table' ? 'table' : 'tree'
  // The tree is server-rendered Astro markup outside this island; the page
  // hides it under this class, set inline before first paint for ?view=table.
  useEffect(() => {
    document.documentElement.classList.toggle(
      'taxonomy-table-view',
      view === 'table',
    )
  }, [view])

  return (
    <div className={styles.toggle}>
      <div className={styles.controls}>
        <div>
          <label className={styles.option}>
            <input
              type="radio"
              name="taxonomyView"
              checked={view === 'tree'}
              onChange={() => {
                setView('tree')
              }}
            />
            Tree view
          </label>
          <label className={styles.option}>
            <input
              type="radio"
              name="taxonomyView"
              checked={view === 'table'}
              onChange={() => {
                setView('table')
              }}
            />
            Table view
          </label>
        </div>
        <div className={styles.count}>{accessionCount} accessions</div>
      </div>

      {view === 'table' ? <DataTable {...table} /> : null}
    </div>
  )
}
