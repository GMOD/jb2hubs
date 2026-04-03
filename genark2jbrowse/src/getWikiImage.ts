/* eslint-disable no-console */
import * as fs from 'fs'
import * as path from 'path'

import { fetchWikipediaImage, getHubBasePath } from './util.ts'

async function processSpeciesImage(scientificName: string, accession: string) {
  const hubBasePath = getHubBasePath(accession)
  const filePath = path.join(hubBasePath, `image.json`)
  const result = await fetchWikipediaImage(scientificName)
  if (result) {
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2))
    console.log(`Found image for: "${scientificName}"`)
  } else {
    console.log(`Image not found for: "${scientificName}"`)
    fs.writeFileSync(filePath + '.notfound', 'none')
  }
}

if (process.argv.length !== 4) {
  console.error('Usage: node getWikiImage.ts <scientificName> <accession>')
  process.exit(1)
}

const scientificName = process.argv[2]!
const accession = process.argv[3]!

if (!accession || accession === 'null') {
  console.error('Error: Invalid accession provided', {
    accession,
    scientificName,
  })
  process.exit(1)
}

await processSpeciesImage(scientificName, accession)
