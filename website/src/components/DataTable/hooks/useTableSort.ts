import { useCallback } from 'react'

import { useUrlState } from '../../../hooks/useUrlState.ts'
import { sortOrder } from '../utils.ts'

export function useTableSort() {
  const [sortId, setSortId] = useUrlState('sort', '')
  const [dir, setDir] = useUrlState('dir', '')
  const sortDesc = dir === 'desc'

  const handleSort = useCallback(
    (columnId: string) => {
      if (sortId === columnId) {
        if (!sortDesc) {
          setDir('desc')
        } else {
          setSortId('')
          setDir('')
        }
      } else {
        setSortId(columnId)
        setDir('asc')
      }
    },
    [sortId, sortDesc, setSortId, setDir],
  )

  return { sortId, sortDesc, handleSort }
}

export { sortOrder }
