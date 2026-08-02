import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import {
  buildUcscMapping,
  loadAccessionMap,
} from './src/utils/accessionData.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// searchIndex entry: [accession, commonName, scientificName, assemblyName, assemblyStatus, source, taxonId, ncbiStatus]
type SearchEntry = [
  string,
  string,
  string,
  string,
  string,
  string,
  number,
  number,
]

const searchIndex: SearchEntry[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'public/searchIndex.json'), 'utf-8'),
)

const outputPath = path.join(__dirname, 'public/ortholog_index.json')

// UCSC-native assemblies (human/hg38, mouse/mm39, …) get their browser db baked
// in so the client can launch the curated /ucsc/<db> config instead of the
// GenArk-sharded config, whose sequence data 404s for these genomes.
const ucscMapping = buildUcscMapping(loadAccessionMap())

// Only GCF (RefSeq) assemblies appear in NCBI ortholog API responses.
// Format: { accession: [commonName, scientificName, taxonId, ucscDb?] }
const index: Record<
  string,
  [string, string, number] | [string, string, number, string]
> = {}
let ucscCount = 0
for (const entry of searchIndex) {
  if (entry[0].startsWith('GCF_')) {
    const ucscDb = ucscMapping.get(entry[0])
    index[entry[0]] = ucscDb
      ? [entry[1], entry[2], entry[6], ucscDb]
      : [entry[1], entry[2], entry[6]]
    if (ucscDb) {
      ucscCount += 1
    }
  }
}

fs.writeFileSync(outputPath, JSON.stringify(index))

const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0)
console.log(
  `Ortholog index: ${Object.keys(index).length} GCF assemblies ` +
    `(${ucscCount} UCSC-native), ${sizeKB} KB`,
)
