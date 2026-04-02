/* eslint-disable no-console */
import * as fs from 'fs'
import * as path from 'path'

import { getHubBasePath, processSpeciesName } from './util.ts'

async function getWikipediaMainImage(pageTitle: string, lang = 'en') {
  const apiUrl = `https://${lang}.wikipedia.org/w/api.php`
  const params = {
    action: 'query',
    titles: pageTitle,
    prop: 'pageimages',
    pithumbsize: '500',
    format: 'json',
    redirects: '1',
  }
  const queryString = new URLSearchParams(params as any).toString()
  const url = `${apiUrl}?${queryString}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`)
  }

  const data = await response.json()
  const pages = data.query?.pages

  if (!pages) {
    throw new Error(`Could not find pages in the API response for ${url}`)
  }

  const pageId = Object.keys(pages)[0]!
  const page = pages[pageId]

  if (pageId === '-1' || !page.thumbnail) {
    throw new Error(
      `Page "${pageTitle}" not found or no thumbnail image available.`,
    )
  }

  return page.thumbnail.source
}

async function processSpeciesImage(scientificName: string, accession: string) {
  const hubBasePath = getHubBasePath(accession)
  const filePath = path.join(hubBasePath, `image.json`)
  // Applied twice: removing one suffix can expose another (e.g. "sp. ATCC 123" → "sp." → "")
  const processedName = processSpeciesName(processSpeciesName(scientificName))

  try {
    const imageUrl = await getWikipediaMainImage(processedName)
    if (!imageUrl) {
      throw new Error('No image URL detected in response')
    }
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          imageUrl,
          pageUrl: `https://wikipedia.org/wiki/${processedName}`,
        },
        null,
        2,
      ),
    )
    console.log(
      `Found image for: "${scientificName}" (used string "${processedName}")`,
    )
  } catch (e) {
    if (processedName.split(' ').length > 2) {
      const words = processedName.split(' ')
      if (
        words.length >= 2 &&
        words[words.length - 1] === words[words.length - 2]
      ) {
        const deduplicatedName = words.slice(0, -1).join(' ')
        try {
          const imageUrl = await getWikipediaMainImage(deduplicatedName)
          if (imageUrl) {
            fs.writeFileSync(
              filePath,
              JSON.stringify(
                {
                  imageUrl,
                  pageUrl: `https://wikipedia.org/wiki/${deduplicatedName}`,
                },
                null,
                2,
              ),
            )
            return
          }
        } catch (_retryError) {}
      }
    }
    console.log(
      `Image not found for: "${scientificName}" (used string "${processedName}")`,
    )
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
