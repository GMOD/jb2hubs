import { pageIndexFromParam, pageSizeFromParam } from '../utils/paginate.ts'
import { useUrlState } from './useUrlState.ts'

// A table's page (`?page=`, 1-based) and page size (`?size=`). `fromPageOne`
// wraps a setter so a new search, filter or sort starts on page one: page 7 of
// a new order is an arbitrary slice of it.
export function useUrlPagination(defaultSize: number) {
  const [pageParam, writePage] = useUrlState('page', '1')
  const [sizeParam, writeSize] = useUrlState('size', String(defaultSize))
  const setPage = (index: number) => {
    writePage(String(index + 1))
  }
  return {
    page: pageIndexFromParam(pageParam),
    pageSize: pageSizeFromParam(sizeParam, defaultSize),
    setPage,
    setPageSize: (size: number) => {
      writeSize(String(size))
      setPage(0)
    },
    fromPageOne:
      <T>(write: (value: T) => void) =>
      (value: T) => {
        write(value)
        setPage(0)
      },
  }
}
