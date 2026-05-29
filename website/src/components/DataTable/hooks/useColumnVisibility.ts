import { useCallback } from 'react'

import { useUrlState } from '../../../hooks/useUrlState.ts'

export function useColumnVisibility() {
  const [show, setShow] = useUrlState('show', '')
  const showAllColumns = show === 'true'
  const setShowAllColumns = useCallback(
    (v: boolean) => {
      setShow(v ? 'true' : '')
    },
    [setShow],
  )
  return { showAllColumns, setShowAllColumns }
}
