import fs from 'fs'
import readline from 'readline'
import zlib from 'zlib'

import { getColNames } from './utils/getColNames.ts'
import { parseTableLine } from './utils/parseTableLine.ts'

export async function genBed12(sql: string, txtGz: string) {
  const txt = fs.readFileSync(sql, 'utf8')
  const cols = getColNames(txt)
  const rl = readline.createInterface({
    input: fs.createReadStream(txtGz).pipe(zlib.createGunzip()),
  })
  process.stdout.write(
    '#' +
      [
        'genoName',
        'genoStart',
        'genoEnd',
        'name',
        'strand',
        'repFamily',
        'repClass',
        'repStart',
        'repEnd',
        'repLeft',
        'swScore',
        'milliDiv',
        'milliDel',
        'milliIns',
      ].join('\t') +
      '\n',
  )
  for await (const line of rl) {
    const {
      swScore,
      milliDiv,
      milliDel,
      milliIns,
      genoName,
      genoStart,
      genoEnd,
      strand,
      repName,
      repClass,
      repFamily,
      repStart,
      repEnd,
      repLeft,
    } = parseTableLine(line, cols.colNames)
    process.stdout.write(
      [
        genoName,
        genoStart,
        genoEnd,
        repName,
        strand,
        repFamily,
        repClass,
        repStart,
        repEnd,
        repLeft,
        swScore,
        milliDiv,
        milliDel,
        milliIns,
      ].join('\t') + '\n',
    )
  }
}

if (process.argv.length !== 4) {
  console.error('Usage: node rmskLike.ts <sqlFile> <txtGzFile>')
  process.exit(1)
}

await genBed12(process.argv[2]!, process.argv[3]!)
