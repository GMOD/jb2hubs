import { useEffect, useState } from 'react'

export function useColumnVisibility() {
  const [showAllColumns, setShowAllColumns] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setShowAllColumns(params.get('show') === 'true')
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (showAllColumns) {
      params.set('show', 'true')
    } else {
      params.delete('show')
    }
    window.history.replaceState(
      null,
      '',
      `?${params.toString()}${window.location.hash}`,
    )
  }, [showAllColumns])

  return { showAllColumns, setShowAllColumns }
}
