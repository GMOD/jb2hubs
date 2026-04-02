import fs from 'fs'
import zlib from 'zlib'

import { getColNames } from './utils/getColNames.ts'
import { parseTableLine } from './utils/parseTableLine.ts'

function parseLineByLine(buffer: Uint8Array, cb: (line: string) => void) {
  let blockStart = 0
  const decoder = new TextDecoder('utf8')
  let currentLine = ''

  while (blockStart < buffer.length) {
    const newlineIndex = buffer.indexOf(10, blockStart) // newline (LF)
    const lineEnd = newlineIndex === -1 ? buffer.length : newlineIndex
    const lineBuffer = buffer.slice(blockStart, lineEnd)
    blockStart = lineEnd + 1

    const decodedLine = decoder.decode(lineBuffer).trim()

    if (decodedLine.endsWith('\\')) {
      // continuation line
      currentLine += decodedLine.slice(0, -1) + ' '
    } else {
      cb((currentLine + decodedLine).replace(/\r/g, '\\r'))
      currentLine = ''
    }
  }
  // Process any remaining content after loop finishes
  if (currentLine) {
    cb(currentLine.replace(/\r/g, '\\r'))
  }
}

function generateBed12(sqlFilePath: string, txtGzFilePath: string) {
  const cols = getColNames(fs.readFileSync(sqlFilePath, 'utf8'))
  const gzippedContent = fs.readFileSync(txtGzFilePath)
  const unzippedContent = zlib.gunzipSync(gzippedContent)

  parseLineByLine(unzippedContent, line => {
    const {
      chrom,
      txStart,
      score,
      name,
      name2,
      strand,
      txEnd,
      exonStarts,
      cdsStart,
      cdsEnd,
      exonEnds,
    } = parseTableLine(line, cols.colNames)

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
        name2,
      ].join('\t') + '\n',
    )
  })
}

if (process.argv.length !== 4) {
  console.error('Usage: node geneLike.ts <sqlFile> <txtGzFile>')
  process.exit(1)
}

generateBed12(process.argv[2]!, process.argv[3]!)
