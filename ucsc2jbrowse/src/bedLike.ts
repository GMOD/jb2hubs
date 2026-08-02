import fs from 'fs'

import { getColNames } from './utils/getColNames.ts'

/**
 * Generates a BED-like header from a SQL file.
 * @param sqlFilePath The path to the SQL file.
 */
function generateBedHeader(sqlFilePath: string) {
  const fileContent = fs.readFileSync(sqlFilePath, 'utf8')
  const { colNames } = getColNames(fileContent)

  if (colNames.join(',').startsWith('bin,chrom,chromStart,chromEnd')) {
    console.log('#' + colNames.slice(1).join('\t'))
  } else if (colNames.join(',').startsWith('chrom,chromStart,chromEnd')) {
    console.error('no_bin')
    console.log('#' + colNames.join('\t'))
  } else {
    throw new Error('Unexpected database structure: ' + colNames.join(','))
  }
}

if (process.argv.length !== 3) {
  console.error('Usage: node bedLike.ts <sqlFile>')
  process.exit(1)
}

generateBedHeader(process.argv[2]!)
