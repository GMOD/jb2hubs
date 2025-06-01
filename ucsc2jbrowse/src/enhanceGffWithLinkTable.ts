import fs from 'fs'
import readline from 'readline'
import zlib from 'zlib'

import { getColNames } from './utils/getColNames.ts'

function encode(s: string) {
  return s
    .replaceAll(';', '%3B')
    .replaceAll('=', '%3D')
    .replaceAll('&', '%26')
    .replaceAll(',', '%2C')
}

export async function enhanceGffWithLinkTable(
  gffFile: string,
  linkFile: string,
  linkSqlFile: string,
) {
  const rl = readline.createInterface({
    input: fs.createReadStream(gffFile),
  })

  const linkCols = getColNames(fs.readFileSync(linkSqlFile, 'utf8'))
  const data = Object.fromEntries(
    zlib
      .gunzipSync(fs.readFileSync(linkFile))
      .toString('utf8')
      .split('\n')
      .filter(f => !!f)
      .map(r => r.split('\t'))
      .map(
        ret =>
          [
            ret[0]!,
            Object.fromEntries(
              ret.map(
                (col, idx) =>
                  [linkCols.colNames[idx]!, col.split(',')] as const,
              ),
            ),
          ] as const,
      ),
  )

  for await (const line of rl) {
    if (line.startsWith('#')) {
      process.stdout.write(line + '\n')
    } else {
      const [chr, source, type, start, end, score, strand, phase, col9] =
        line.split('\t')

      const col9attrs = Object.fromEntries(
        col9!
          .split(';')
          .map(f => f.trim())
          .filter(f => !!f)
          .map(f => f.split('=') as [string, string])
          .map(
            ([key, val]) =>
              [
                key.trim(),
                key.trim() === 'description' ? [val] : val.split(','),
              ] as const,
          ),
      )
      const ID0 = col9attrs.ID?.[0] ?? ''
      const r0 = Object.fromEntries(
        Object.entries(data[ID0] ?? {})
          .map(([key, val]) => [key, val] as const)
          .filter(([_key, val]) => val.filter(f => !!f).length > 0),
      )

      process.stdout.write(
        [
          chr,
          source,
          type,
          start,
          end,
          score,
          strand,
          phase,
          Object.entries({ ...col9attrs, ...r0 })
            .map(([key, val]) => [key, val.map(r => encode(r)).join(',')])
            .filter(([_key, val]) => !!val)
            .map(([key, val]) => `${key}=${val}`)
            .join(';'),
        ].join('\t') + '\n',
      )
    }
  }
}

await enhanceGffWithLinkTable(
  process.argv[2]!,
  process.argv[3]!,
  process.argv[4]!,
)
