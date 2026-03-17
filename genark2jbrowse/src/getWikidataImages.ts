/* eslint-disable no-console */
import * as fs from 'fs'
import * as path from 'path'

// Fetches species images from Wikidata SPARQL as a fallback for species
// where Wikipedia pageimages lookup failed. Wikidata links NCBI taxon IDs
// directly to Wikimedia Commons images via properties P685 (taxon ID) and
// P18 (image), catching cases where the Wikipedia article is under a
// different name or has no thumbnail.

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'jb2hubs/1.0 (https://jbrowse.org)'
const BATCH_SIZE = 20000
const CACHE_PATH = 'genark2jbrowse/wikidata-species.json'

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

async function fetchSparql(query: string): Promise<any> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (res.ok) {
      return res.json()
    }
    if (res.status === 429 || res.status === 503 || res.status === 504) {
      const delay = 30000 * (attempt + 1)
      console.log(`  Server error (${res.status}), waiting ${delay / 1000}s...`)
      await new Promise(r => setTimeout(r, delay))
      continue
    }
    throw new Error(`SPARQL query failed: ${res.status}`)
  }
  throw new Error('SPARQL query failed after retries')
}

async function fetchAllSpeciesWithImages(): Promise<WikidataSpecies[]> {
  if (fs.existsSync(CACHE_PATH)) {
    const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
    console.log(`Using cached Wikidata results (${cached.length} species)`)
    return cached
  }

  console.log('Fetching species with images from Wikidata SPARQL...')
  const allResults: WikidataSpecies[] = []

  const partialPath = CACHE_PATH + '.partial'
  let offset = 0
  if (fs.existsSync(partialPath)) {
    const partial = JSON.parse(fs.readFileSync(partialPath, 'utf8'))
    allResults.push(...partial)
    offset = allResults.length
    console.log(`  Resuming from ${offset} (partial cache)`)
  }

  while (true) {
    const query = `
SELECT ?taxId ?scientificName ?image WHERE {
  ?item wdt:P685 ?taxId .
  ?item wdt:P18 ?image .
  ?item wdt:P225 ?scientificName .
}
LIMIT ${BATCH_SIZE} OFFSET ${offset}
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

    offset += BATCH_SIZE
    if (results.length < BATCH_SIZE) {
      break
    }
    await new Promise(r => setTimeout(r, 5000))
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(allResults))
  if (fs.existsSync(partialPath)) {
    fs.unlinkSync(partialPath)
  }
  console.log(`Cached ${allResults.length} species to ${CACHE_PATH}`)
  return allResults
}

function getHubBasePath(accession: string): string {
  const [basePrefix, restOfAccession] = accession.split('_')
  const [b1, b2, b3] = restOfAccession!.match(/.{1,3}/g)!
  return `hubs/${basePrefix}/${b1}/${b2}/${b3}/${accession}`
}

async function main() {
  const wikidataSpecies = await fetchAllSpeciesWithImages()

  // Build lookup by taxId
  const imageByTaxId = new Map<number, string>()
  for (const s of wikidataSpecies) {
    if (!imageByTaxId.has(s.taxId)) {
      imageByTaxId.set(s.taxId, s.imageUrl)
    }
  }
  console.log(`${imageByTaxId.size} unique taxon IDs with images in Wikidata`)

  // Find hubs that are missing images and have a taxonId match
  const hubDirs = fs
    .readdirSync('hubs', { recursive: true })
    .filter(f => String(f).endsWith('meta.json'))

  let found = 0
  let alreadyHad = 0
  let noMatch = 0

  for (const metaPath of hubDirs) {
    const dir = path.dirname(path.join('hubs', String(metaPath)))
    const imageFile = path.join(dir, 'image.json')
    const notfoundFile = path.join(dir, 'image.json.notfound')

    // Skip if already has an image
    if (fs.existsSync(imageFile)) {
      alreadyHad++
      continue
    }

    // Only try Wikidata for species where Wikipedia failed
    if (!fs.existsSync(notfoundFile)) {
      continue
    }

    let meta: any
    try {
      meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'))
    } catch {
      continue
    }

    const taxId = meta.taxonId
    if (!taxId) {
      continue
    }

    const commonsUrl = imageByTaxId.get(taxId)
    if (!commonsUrl) {
      noMatch++
      continue
    }

    const thumbUrl = commonsUrlToThumb(commonsUrl)
    fs.writeFileSync(
      imageFile,
      JSON.stringify(
        {
          imageUrl: thumbUrl,
          pageUrl: `https://commons.wikimedia.org/wiki/File:${decodeURIComponent(commonsUrl.split('/').pop()!)}`,
        },
        null,
        2,
      ),
    )
    // Remove the notfound sentinel since we found an image
    fs.unlinkSync(notfoundFile)
    found++
    if (found % 100 === 0) {
      console.log(`  Found ${found} images so far...`)
    }
  }

  console.log('')
  console.log(`Results:`)
  console.log(`  Already had image: ${alreadyHad}`)
  console.log(`  Found via Wikidata: ${found}`)
  console.log(`  No Wikidata match: ${noMatch}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
