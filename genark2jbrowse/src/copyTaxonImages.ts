import * as fs from 'fs'
import * as path from 'path'

import { getHubBasePath } from './util.ts'

// Copies taxon-level images from `taxon_images/{taxonId}.json` into each
// accession's hub directory as `image.json`.  This ensures every assembly
// for a given species gets the same image without redundant API calls.

const TAXON_IMAGES_DIR = 'taxon_images'
const INPUT_FILE = 'processedHubJson/all.json'

function main() {
  const allData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8')) as {
    accession: string
    taxonId: number
  }[]

  let copied = 0
  let alreadyHad = 0
  let noTaxonImage = 0
  let errors = 0

  for (const entry of allData) {
    const { accession, taxonId } = entry
    if (!accession || !taxonId) {
      continue
    }

    const hubDir = getHubBasePath(accession)
    const destPath = path.join(hubDir, 'image.json')

    if (fs.existsSync(destPath)) {
      alreadyHad++
      continue
    }

    const taxonImageFile = path.join(TAXON_IMAGES_DIR, `${taxonId}.json`)
    if (!fs.existsSync(taxonImageFile)) {
      noTaxonImage++
      continue
    }

    try {
      fs.copyFileSync(taxonImageFile, destPath)
      copied++
    } catch (e) {
      errors++
    }
  }

  console.log('Copy taxon images to accession directories:')
  console.log(`  Already had image:  ${alreadyHad}`)
  console.log(`  Copied:             ${copied}`)
  console.log(`  No taxon image:     ${noTaxonImage}`)
  if (errors > 0) {
    console.log(`  Errors:             ${errors}`)
  }
}

main()
