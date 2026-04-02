/* eslint-disable no-console */
import fs from 'fs'
import readline from 'readline'
import zlib from 'zlib'

import { getColNames } from './utils/getColNames.ts'
import { parseTableLine } from './utils/parseTableLine.ts'

if (!process.argv[2]) {
  throw new Error('usage: node parser.js <sql file>')
}
const txt = fs.readFileSync(process.argv[2], 'utf8')

const cols = getColNames(txt)

const rl = readline.createInterface({
  input: fs.createReadStream(process.argv[3]!).pipe(zlib.createGunzip()),
})

const ret = {} as Record<string, unknown>
let currentLine = ''
for await (const line of rl) {
  if (line.endsWith('\\')) {
    // the extra space is needed here to avoid the tabs in the html checker in
    // parseTableLine
    currentLine += line.slice(0, -1) + '\n'
  } else if (currentLine) {
    const r = parseTableLine(currentLine, cols.colNames)
    ret[r.tableName!] = r
    currentLine = ''
  }
}
console.log(JSON.stringify(ret, null, 2))
