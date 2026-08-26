// Hand the reader a text file. The object url is revoked in the same turn as the
// synthetic click, which is what keeps a button the user can press on every
// keystroke of a filter from accreting blobs for the life of the page — a
// long-lived href would.
export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/tab-separated-values' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
