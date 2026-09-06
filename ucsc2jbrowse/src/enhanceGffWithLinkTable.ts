import fs from 'fs'
import readline from 'readline'
import zlib from 'zlib'

import { encodeGffAttribute } from './utils/encodeGffAttribute.ts'
import { getColNames } from './utils/getColNames.ts'

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
      // The link table's `name` column is the gene/locus. JBrowse lowercases
      // attribute keys, so a lowercase `name` here would clobber the transcript
      // feature's `Name` and every transcript would display the gene. Rename it
      // to gene_name so the transcript keeps its own Name (the transcript id).
      const r0 = Object.fromEntries(
        Object.entries(data[ID0] ?? {})
          .filter(([_key, val]) => val.filter(f => !!f).length > 0)
          .map(
            ([key, val]) => [key === 'name' ? 'gene_name' : key, val] as const,
          ),
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
            .map(([key, val]) => [
              key,
              val.map(r => encodeGffAttribute(r)).join(','),
            ])
            .filter(([_key, val]) => !!val)
            .map(([key, val]) => `${key}=${val}`)
            .join(';'),
        ].join('\t') + '\n',
      )
    }
  }
}

if (process.argv.length !== 5) {
  console.error(
    'Usage: node enhanceGffWithLinkTable.ts <inputGff> <linkTableTxtGz> <linkTableSql> > <outputGff>',
  )
  process.exit(1)
}

await enhanceGffWithLinkTable(
  process.argv[2]!,
  process.argv[3]!,
  process.argv[4]!,
)
