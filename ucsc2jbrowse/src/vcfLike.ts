import fs from 'fs'
import readline from 'readline'
import zlib from 'zlib'

import { getColNames } from './utils/getColNames.ts'
import { parseTableLine } from './utils/parseTableLine.ts'

async function processVcfLikeData(sqlFilePath: string, txtGzFilePath: string) {
  const sqlContent = fs.readFileSync(sqlFilePath, 'utf8')
  const { colNames } = getColNames(sqlContent)

  const rl = readline.createInterface({
    input: fs.createReadStream(txtGzFilePath).pipe(zlib.createGunzip()),
  })

  for await (const line of rl) {
    const {
      chrom,
      txStart,
      score,
      name,
      strand,
      txEnd,
      exonStarts,
      cdsStart,
      cdsEnd,
      exonEnds,
    } = parseTableLine(line, colNames)

    const starts = exonStarts
      ?.split(',')
      .filter(Boolean)
      .map(r => +r - +txStart!)
    const ends = exonEnds
      ?.split(',')
      .filter(Boolean)
      .map(r => +r - +txStart!)

    const sizes = starts && ends ? starts.map((s, i) => ends[i]! - s) : []

    process.stdout.write(
      [
        chrom,
        txStart,
        txEnd,
        name,
        score,
        strand,
        cdsStart,
        cdsEnd,
        '0,0,0',
        starts?.length ?? 0,
        sizes.join(','),
        starts?.join(','),
      ].join('\t') + '\n',
    )
  }
}

if (process.argv.length !== 4) {
  console.error('Usage: node vcfLike.ts <sqlFile> <txtGzFile>')
  process.exit(1)
}

await processVcfLikeData(process.argv[2]!, process.argv[3]!)
