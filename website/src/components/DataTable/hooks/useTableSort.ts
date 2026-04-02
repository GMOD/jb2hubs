import { useEffect, useState } from 'react'

import { sortOrder } from '../utils.ts'

export function useTableSort() {
  const [sortId, setSortId] = useState('')
  const [sortDesc, setSortDesc] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('sort') ?? ''
    const dir = params.get('dir')
    setSortId(id)
    setSortDesc(dir === 'desc')
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (sortId) {
        params.set('sort', sortId)
        params.set('dir', sortDesc ? 'desc' : 'asc')
      } else {
        params.delete('sort')
        params.delete('dir')
      }
      window.history.replaceState(
        null,
        '',
        `?${params.toString()}${window.location.hash}`,
      )
    }
  }, [sortId, sortDesc])

  const handleSort = (columnId: string) => {
    if (sortId === columnId) {
      if (!sortDesc) {
        setSortDesc(true)
      } else {
        setSortId('')
        setSortDesc(false)
      }
    } else {
      setSortId(columnId)
      setSortDesc(false)
    }
  }

  return { sortId, sortDesc, handleSort }
}

export { sortOrder }
