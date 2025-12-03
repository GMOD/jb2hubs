/* eslint-disable no-console */
import * as fs from 'fs'
import * as path from 'path'

function getHubBasePath(accession: string): string {
  try {
    const [basePrefix, restOfAccession] = accession.split('_')
    const [part1, part2, part3] = restOfAccession!.match(/.{1,3}/g)!
    return `hubs/${basePrefix}/${part1}/${part2}/${part3}/${accession}`
  } catch (e) {
    console.error(e, { accession })
    throw e
  }
}

function processSpeciesName(speciesName: string): string {
  return speciesName
    .replace(/\s+=\s.*$/, '') // Remove anything after " = "
    .replace(/^Candidatus\s+/i, '') // Remove "Candidatus" at the beginning
    .replace(/\s+-\s.*$/, '') // Remove anything after " - "
    .replace(/\s+\d+\s*$/, '') // Remove trailing numbers
    .replace(/\s+(str\.|strain).*$/i, '') // Remove anything after "str." or "strain"
    .replace(/\s+var\..*$/i, '') // Remove anything after "var."
    .replace(/\s+sp\..*$/i, '') // Remove anything after "sp."
    .replace(/\s+bv\..*$/i, '') // Remove anything after "bv."
    .replace(/\s+subsp\..*$/i, '') // Remove anything after "sp."
    .replace(/\s+serovar.*$/i, '') // Remove anything after "serovar"
    .replace(/\s+biovar.*$/i, '') // Remove anything after "biovar"
    .replace(/\s+cf.*$/i, '') // Remove anything after "cf"
    .replace(/\s+f\..*$/i, '') // Remove anything after "f."
    .replace(/\s+type.*$/i, '') // Remove anything after "type"
    .replace(/\s+ATCC.*$/i, '') // Remove anything after "ATCC"
    .replace(/\s+GI\/.*$/i, '') // Remove anything after "GI/"
    .replace(/\s+HU\/.*$/i, '') // Remove anything after "GI/"
    .replace(/\s+\S*:.*$/, '') // Remove last word if it contains a colon
    .replace(/\s+[A-Z0-9\-.]+$/, '') // Remove last word if it's all capital letters, numbers, dashes, or dots
    .trim()
}

async function getWikipediaMainImage(pageTitle: string, lang = 'en') {
  const apiUrl = `https://${lang}.wikipedia.org/w/api.php`

  // API parameters to get page information and images
  const params = {
    action: 'query',
    titles: pageTitle,
    prop: 'pageimages',
    pithumbsize: '500', // Set the desired thumbnail size
    format: 'json',
    redirects: '1', // Automatically follow redirects
  }

  // Construct the URL with query parameters
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

  // The API returns page IDs as keys, so we need to get the first one
  const pageId = Object.keys(pages)[0]!
  const page = pages[pageId]

  // Check if the page exists and has a thumbnail
  if (pageId === '-1' || !page.thumbnail) {
    throw new Error(
      `Page "${pageTitle}" not found or no thumbnail image available.`,
    )
  }

  // The 'thumbnail' object contains the image URL
  return page.thumbnail.source
}

async function processSpeciesImage(scientificName: string, accession: string) {
  const hubBasePath = getHubBasePath(accession)
  const filePath = path.join(hubBasePath, `image.json`)
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
        } catch (retryError) {
          // If retry fails, continue with original error handling
        }
      }
    }
    if (scientificName !== processedName) {
      // console.log(`${e}`, { scientificName, processedName })
    } else {
      // console.log(`${e}`)
    }
    console.log(
      `Image not found for: "${scientificName}" (used string "${processedName}")`,
    )
    fs.writeFileSync(filePath + '.notfound', 'none')
  }
}

const scientificName = process.argv[2]!
const accession = process.argv[3]!

if (accession && accession !== 'null') {
  await processSpeciesImage(scientificName, accession)
} else {
  console.error('No accession?', { accession, scientificName })
}
