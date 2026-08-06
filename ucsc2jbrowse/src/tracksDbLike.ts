import fs from 'fs'
import zlib from 'zlib'

import { getColNames } from './utils/getColNames.ts'
import { parseTableLine } from './utils/parseTableLine.ts'
import { splitTableRecords } from './utils/splitTableRecords.ts'

if (!process.argv[2]) {
  throw new Error('usage: node parser.js <sql file>')
}
const txt = fs.readFileSync(process.argv[2], 'utf8')

const cols = getColNames(txt)

// Read whole rather than stream: the largest of these is hg38 at 22MB
// uncompressed, and splitTableRecords needs line splitting that readline
// cannot express (see its comment).
const table = zlib
  .gunzipSync(fs.readFileSync(process.argv[3]!))
  .toString('utf8')

const ret = {} as Record<string, unknown>
for (const record of splitTableRecords(table)) {
  const r = parseTableLine(record, cols.colNames)
  ret[r.tableName!] = r
}
console.log(JSON.stringify(ret, null, 2))
