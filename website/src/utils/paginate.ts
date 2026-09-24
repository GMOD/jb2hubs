export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const clampedPage = Math.max(0, Math.min(page, pageCount - 1))
  const pageRows = rows.slice(
    clampedPage * pageSize,
    (clampedPage + 1) * pageSize,
  )
  return { pageCount, clampedPage, pageRows }
}

export const PAGE_SIZES = [100, 200, 500, 1000]

// A page as the URL spells it: 1-based, so `?page=2` is the second page. A
// value that is not a positive integer is the first page.
export function pageIndexFromParam(param: string) {
  const page = Number(param)
  return Number.isInteger(page) && page > 1 ? page - 1 : 0
}

// A page size the URL names only counts if the size menu offers it, so a hand-
// edited `?size=37` cannot leave the menu showing one size while the table
// slices another.
export function pageSizeFromParam(param: string, fallback: number) {
  const size = Number(param)
  return PAGE_SIZES.includes(size) ? size : fallback
}
