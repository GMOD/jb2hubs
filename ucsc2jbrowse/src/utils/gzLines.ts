import fs from 'fs'
import zlib from 'zlib'

// Splits on LF only. readline also splits on a lone CR, and UCSC ships raw CRs
// inside fields (dm6's `Dper\ry`), so it would cut those rows in two.
export async function* gzLines(file: string) {
  const decoder = new TextDecoder('utf8')
  let rest = ''
  for await (const chunk of fs
    .createReadStream(file)
    .pipe(zlib.createGunzip())) {
    const lines = (
      rest + decoder.decode(chunk as Buffer, { stream: true })
    ).split('\n')
    rest = lines.pop()!
    yield* lines
  }
  rest += decoder.decode()
  if (rest) {
    yield rest
  }
}

// A UCSC table dump's rows: a line ending in a backslash continues on the next,
// and a raw CR becomes the two characters `\r`.
export async function* tableRows(file: string) {
  let pending = ''
  for await (const raw of gzLines(file)) {
    const line = raw.replace(/[ \r]+$/, '')
    if (line.endsWith('\\')) {
      pending += line.slice(0, -1) + ' '
    } else {
      const row = (pending + line).replaceAll('\r', '\\r')
      pending = ''
      if (row) {
        yield row
      }
    }
  }
  if (pending) {
    yield pending.replaceAll('\r', '\\r')
  }
}
