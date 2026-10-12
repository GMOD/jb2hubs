import { useUrlState } from '../../../hooks/useUrlState.ts'

export function useTableSort() {
  const [sortId, setSortId] = useUrlState('sort', '')
  const [dir, setDir] = useUrlState('dir', '')
  const sortDesc = dir === 'desc'

  const handleSort = (columnId: string) => {
    if (sortId !== columnId) {
      setSortId(columnId)
      setDir('asc')
    } else if (!sortDesc) {
      setDir('desc')
    } else {
      setSortId('')
      setDir('')
    }
  }

  return { sortId, sortDesc, handleSort }
}
