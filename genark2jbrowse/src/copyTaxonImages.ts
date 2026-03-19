/* eslint-disable no-console */
import * as fs from 'fs'
import * as path from 'path'

// Copies taxon-level images from `taxon_images/{taxonId}.json` into each
// accession's hub directory as `image.json`.  This ensures every assembly
// for a given species gets the same image without redundant API calls.

const TAXON_IMAGES_DIR = 'taxon_images'
const INPUT_FILE = 'processedHubJson/all.json'

function getHubBasePath(accession: string): string {
  const [basePrefix, restOfAccession] = accession.split('_')
  const [b1, b2, b3] = restOfAccession!.match(/.{1,3}/g)!
  return `hubs/${basePrefix}/${b1}/${b2}/${b3}/${accession}`
}

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

      // Clean up old notfound sentinel if present
      const notfoundPath = destPath + '.notfound'
      if (fs.existsSync(notfoundPath)) {
        fs.unlinkSync(notfoundPath)
      }

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
