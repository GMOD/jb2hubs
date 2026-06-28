import React, { useEffect } from 'react'

import ClientOnlyDataTable from './ClientOnlyDataTable.tsx'
import { useUrlState } from '../hooks/useUrlState.ts'

import type { RowData } from './DataTable/hooks/useTableColumns.tsx'

interface Props {
  rows: RowData[]
  treeContainerId: string
  accessionCount: number
}

export default function TaxonomyViewToggle({
  rows,
  treeContainerId,
  accessionCount,
}: Props) {
  const [viewParam, setView] = useUrlState('view', 'tree')
  const view = viewParam === 'table' ? 'table' : 'tree'
  useEffect(() => {
    const treeContainer = document.getElementById(treeContainerId)
    if (treeContainer) {
      treeContainer.style.display = view === 'tree' ? 'block' : 'none'
    }
  }, [view, treeContainerId])

  return (
    <div style={{ marginBottom: '16px' }}>
      <div
        style={{
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <label style={{ marginRight: '15px' }}>
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
          <label style={{ marginRight: '15px' }}>
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
        <div style={{ color: '#6b7280' }}>{accessionCount} accessions</div>
      </div>

      {view === 'table' ? <ClientOnlyDataTable rows={rows} /> : null}
    </div>
  )
}
