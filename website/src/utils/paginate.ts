export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const clampedPage = Math.min(page, pageCount - 1)
  const pageRows = rows.slice(
    clampedPage * pageSize,
    (clampedPage + 1) * pageSize,
  )
  return { pageCount, clampedPage, pageRows }
}
