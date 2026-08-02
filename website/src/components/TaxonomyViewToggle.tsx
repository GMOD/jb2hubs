import { useEffect } from 'react'

import DataTable from './DataTable.tsx'
import styles from './TaxonomyViewToggle.module.css'
import { useUrlState } from '../hooks/useUrlState.ts'

import type { TableProps } from './DataTable.tsx'

interface Props {
  table: TableProps
  treeContainerId: string
  accessionCount: number
}

export default function TaxonomyViewToggle({
  table,
  treeContainerId,
  accessionCount,
}: Props) {
  const [viewParam, setView] = useUrlState('view', 'tree')
  const view = viewParam === 'table' ? 'table' : 'tree'
  // The tree is server-rendered Astro markup outside this island, so showing and
  // hiding it means reaching for the node. The page hides it inline before first
  // paint when ?view=table, which is what keeps this from flashing the tree.
  useEffect(() => {
    const treeContainer = document.getElementById(treeContainerId)
    if (treeContainer) {
      treeContainer.style.display = view === 'tree' ? 'block' : 'none'
    }
  }, [view, treeContainerId])

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
