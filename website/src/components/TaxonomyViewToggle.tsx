import React, { useEffect, useState } from 'react'

import ClientOnlyDataTable from './ClientOnlyDataTable.tsx'

import type { RowData } from './DataTable/hooks/useTableColumns.tsx'

interface Props {
  rows: RowData[]
  treeContainerId: string
}

export default function TaxonomyViewToggle({ rows, treeContainerId }: Props) {
  const [view, setView] = useState<'tree' | 'table'>('tree')
  const [isClient, setIsClient] = useState(false)

  // Initialize from URL on mount
  useEffect(() => {
    setIsClient(true)
    const params = new URLSearchParams(window.location.search)
    const viewParam = params.get('view')
    if (viewParam === 'table') {
      setView('table')
    }
  }, [])

  // Update URL when view changes
  useEffect(() => {
    if (!isClient) {
      return
    }
    const params = new URLSearchParams(window.location.search)
    if (view === 'table') {
      params.set('view', 'table')
    } else {
      params.delete('view')
    }
    const newUrl =
      params.toString() !== ''
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname
    window.history.replaceState({}, '', newUrl)
  }, [view, isClient])

  // Toggle tree container visibility
  useEffect(() => {
    if (!isClient) {
      return
    }
    const treeContainer = document.getElementById(treeContainerId)
    if (treeContainer) {
      treeContainer.style.display = view === 'tree' ? 'block' : 'none'
    }
  }, [view, treeContainerId, isClient])

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ marginBottom: '8px' }}>
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

      {view === 'table' ? <ClientOnlyDataTable rows={rows} /> : null}
    </div>
  )
}
