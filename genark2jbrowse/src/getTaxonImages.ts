/* eslint-disable no-console */
import * as fs from 'fs'
import * as path from 'path'

import { processSpeciesName } from './util.ts'
// Centralized taxon-level image fetcher.
//
// Images are a property of a taxon, not an individual assembly accession.
// This script fetches one image per unique taxonId and stores it in a
// central `taxon_images/` directory.  A separate script
// (copyTaxonImages.ts) then copies/links these into each accession's hub
// directory.
//
// Lookup strategy (in order of preference):
//   1. Existing hub image.json files (already Wikipedia-sourced, best quality)
//   2. Wikipedia pageimages API – gets the curated main article image
//   3. Wikidata SPARQL – bulk fallback using NCBI taxon ID (P685 → P18)

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'jb2hubs/1.0 (https://jbrowse.org)'
const SPARQL_BATCH_SIZE = 20000
const WIKIDATA_CACHE_PATH = 'wikidata-species.json'
const TAXON_IMAGES_DIR = 'taxon_images'
const INPUT_FILE = 'processedHubJson/all.json'

// ---------------------------------------------------------------------------
// Wikidata helpers
// ---------------------------------------------------------------------------

interface WikidataSpecies {
  taxId: number
  scientificName: string
  imageUrl: string
}

function commonsUrlToThumb(commonsUrl: string, width = 500): string {
  const filename = decodeURIComponent(commonsUrl.split('/').pop()!).replace(
    / /g,
    '_',
  )
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${width}`
}

function commonsUrlToPageUrl(commonsUrl: string): string {
  const filename = decodeURIComponent(commonsUrl.split('/').pop()!)
  return `https://commons.wikimedia.org/wiki/File:${filename}`
}

async function fetchSparql(query: string): Promise<any> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (res.ok) {
      return res.json()
    }
    if (res.status === 429 || res.status === 503 || res.status === 504) {
      const delay = 30000 * (attempt + 1)
      console.log(
        `  SPARQL server error (${res.status}), waiting ${delay / 1000}s...`,
      )
      await new Promise(r => setTimeout(r, delay))
      continue
    }
    throw new Error(`SPARQL query failed: ${res.status}`)
  }
  throw new Error('SPARQL query failed after retries')
}

async function fetchWikidataImages(): Promise<WikidataSpecies[]> {
  if (fs.existsSync(WIKIDATA_CACHE_PATH)) {
    const cached = JSON.parse(fs.readFileSync(WIKIDATA_CACHE_PATH, 'utf8'))
    console.log(`Using cached Wikidata results (${cached.length} species)`)
    return cached
  }

  console.log('Fetching species with images from Wikidata SPARQL...')
  const allResults: WikidataSpecies[] = []

  const partialPath = WIKIDATA_CACHE_PATH + '.partial'
  let offset = 0
  if (fs.existsSync(partialPath)) {
    const partial = JSON.parse(fs.readFileSync(partialPath, 'utf8'))
    allResults.push(...partial)
    offset = allResults.length
    console.log(`  Resuming from ${offset} (partial cache)`)
  }

  for (;;) {
    const query = `
SELECT ?taxId ?scientificName ?image WHERE {
  ?item wdt:P685 ?taxId .
  ?item wdt:P18 ?image .
  ?item wdt:P225 ?scientificName .
}
LIMIT ${SPARQL_BATCH_SIZE} OFFSET ${offset}
`
    console.log(`  Fetching offset ${offset}...`)
    const data = await fetchSparql(query)
    const results = data.results.bindings

    if (results.length === 0) {
      break
    }

    for (const r of results) {
      allResults.push({
        taxId: Number(r.taxId.value),
        scientificName: r.scientificName.value,
        imageUrl: r.image.value,
      })
    }

    console.log(`  Got ${results.length} results (total: ${allResults.length})`)
    fs.writeFileSync(partialPath, JSON.stringify(allResults))

    offset += SPARQL_BATCH_SIZE
    if (results.length < SPARQL_BATCH_SIZE) {
      break
    }
    await new Promise(r => setTimeout(r, 5000))
  }

  fs.writeFileSync(WIKIDATA_CACHE_PATH, JSON.stringify(allResults))
  if (fs.existsSync(partialPath)) {
    fs.unlinkSync(partialPath)
  }
  console.log(`Cached ${allResults.length} species to ${WIKIDATA_CACHE_PATH}`)
  return allResults
}

// ---------------------------------------------------------------------------
// Wikipedia helpers
// ---------------------------------------------------------------------------


async function getWikipediaMainImage(
  pageTitle: string,
  lang = 'en',
): Promise<{ imageUrl: string; pageUrl: string } | undefined> {
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
    return undefined
  }

  const data = await response.json()
  const pages = data.query?.pages
  if (!pages) {
    return undefined
  }

  const pageId = Object.keys(pages)[0]!
  const page = pages[pageId]

  if (pageId === '-1' || !page.thumbnail) {
    return undefined
  }

  return {
    imageUrl: page.thumbnail.source,
    pageUrl: `https://wikipedia.org/wiki/${pageTitle}`,
  }
}

async function fetchWikipediaImage(
  scientificName: string,
): Promise<{ imageUrl: string; pageUrl: string } | undefined> {
  // Applied twice: removing one suffix can expose another (e.g. "sp. ATCC 123" → "sp." → "")
  const processed = processSpeciesName(processSpeciesName(scientificName))

  const result = await getWikipediaMainImage(processed)
  if (result) {
    return result
  }

  // Fallback: deduplicate trailing word (e.g. "Homo Homo" -> "Homo")
  if (processed.split(' ').length > 2) {
    const words = processed.split(' ')
    if (
      words.length >= 2 &&
      words[words.length - 1] === words[words.length - 2]
    ) {
      const dedup = words.slice(0, -1).join(' ')
      return getWikipediaMainImage(dedup)
    }
  }

  return undefined
}

// ---------------------------------------------------------------------------
// Taxon image file helpers
// ---------------------------------------------------------------------------

interface TaxonImage {
  imageUrl: string
  pageUrl: string
}

function taxonImagePath(taxonId: number): string {
  return path.join(TAXON_IMAGES_DIR, `${taxonId}.json`)
}

function taxonNotFoundPath(taxonId: number): string {
  return path.join(TAXON_IMAGES_DIR, `${taxonId}.notfound`)
}

function saveTaxonImage(taxonId: number, image: TaxonImage) {
  fs.writeFileSync(taxonImagePath(taxonId), JSON.stringify(image, null, 2))
}

function hasTaxonImage(taxonId: number): boolean {
  return fs.existsSync(taxonImagePath(taxonId))
}

function hasTaxonNotFound(taxonId: number): boolean {
  return fs.existsSync(taxonNotFoundPath(taxonId))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(TAXON_IMAGES_DIR, { recursive: true })

  // 1. Load all unique taxonIds and their scientific names
  const allData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8')) as {
    accession: string
    taxonId: number
    scientificName: string
  }[]

  const taxonMap = new Map<number, string>()
  for (const entry of allData) {
    if (entry.taxonId && entry.scientificName) {
      taxonMap.set(entry.taxonId, entry.scientificName)
    }
  }

  console.log(`Total unique taxonIds: ${taxonMap.size}`)

  // 2. Import existing hub image.json files into taxon_images/
  //    These are already Wikipedia-sourced and represent the best quality images.
  let imported = 0
  for (const entry of allData) {
    const { accession, taxonId } = entry
    if (!accession || !taxonId || hasTaxonImage(taxonId)) {
      continue
    }
    const [basePrefix, restOfAccession] = accession.split('_')
    const [b1, b2, b3] = restOfAccession!.match(/.{1,3}/g)!
    const hubImagePath = `hubs/${basePrefix}/${b1}/${b2}/${b3}/${accession}/image.json`
    if (fs.existsSync(hubImagePath)) {
      try {
        const img = JSON.parse(fs.readFileSync(hubImagePath, 'utf8'))
        if (img.imageUrl) {
          saveTaxonImage(taxonId, {
            imageUrl: img.imageUrl,
            pageUrl: img.pageUrl ?? '',
          })
          imported++
        }
      } catch {
        // skip malformed files
      }
    }
  }
  console.log(`Imported from existing hub image.json files: ${imported}`)

  // 3. Wikipedia API lookup for remaining taxons (gets curated article image)
  const needLookup = Array.from(taxonMap.entries()).filter(
    ([tid]) => !hasTaxonImage(tid) && !hasTaxonNotFound(tid),
  )

  console.log(`\nTaxons needing lookup: ${needLookup.length}`)
  console.log('Phase 1: Wikipedia API (by species name)...')

  let wpFound = 0
  const needWikidata: [number, string][] = []

  for (let i = 0; i < needLookup.length; i++) {
    const [taxonId, scientificName] = needLookup[i]!

    try {
      const result = await fetchWikipediaImage(scientificName)
      if (result) {
        saveTaxonImage(taxonId, result)
        wpFound++
      } else {
        needWikidata.push([taxonId, scientificName])
      }
    } catch {
      needWikidata.push([taxonId, scientificName])
    }

    if ((i + 1) % 500 === 0) {
      console.log(
        `  Wikipedia progress: ${i + 1}/${needLookup.length} (found: ${wpFound})`,
      )
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`Found via Wikipedia: ${wpFound}`)
  console.log(`Remaining for Wikidata: ${needWikidata.length}`)

  // 4. Wikidata SPARQL fallback (by taxon ID - more reliable matching)
  console.log('\nPhase 2: Wikidata SPARQL fallback...')
  const wikidataSpecies = await fetchWikidataImages()
  const wikidataByTaxId = new Map<number, string>()
  for (const s of wikidataSpecies) {
    if (!wikidataByTaxId.has(s.taxId)) {
      wikidataByTaxId.set(s.taxId, s.imageUrl)
    }
  }
  console.log(
    `${wikidataByTaxId.size} unique taxon IDs with images in Wikidata`,
  )

  let wdFound = 0
  let notFound = 0

  for (const [taxonId] of needWikidata) {
    const commonsUrl = wikidataByTaxId.get(taxonId)
    if (commonsUrl) {
      saveTaxonImage(taxonId, {
        imageUrl: commonsUrlToThumb(commonsUrl),
        pageUrl: commonsUrlToPageUrl(commonsUrl),
      })
      wdFound++
    } else {
      fs.writeFileSync(taxonNotFoundPath(taxonId), 'none')
      notFound++
    }
  }

  console.log(`\nResults:`)
  console.log(`  Imported from existing hubs: ${imported}`)
  console.log(`  Found via Wikipedia:         ${wpFound}`)
  console.log(`  Found via Wikidata:          ${wdFound}`)
  console.log(`  No image found:              ${notFound}`)
  console.log(`  Total with images:           ${imported + wpFound + wdFound}`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
