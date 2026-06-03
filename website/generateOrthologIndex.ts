/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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

// Only GCF (RefSeq) assemblies appear in NCBI ortholog API responses.
// Format: { accession: [commonName, scientificName, taxonId] }
const index: Record<string, [string, string, number]> = {}
for (const entry of searchIndex) {
  if (entry[0].startsWith('GCF_')) {
    index[entry[0]] = [entry[1], entry[2], entry[6]]
  }
}

fs.writeFileSync(outputPath, JSON.stringify(index))

const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0)
console.log(
  `Ortholog index: ${Object.keys(index).length} GCF assemblies, ${sizeKB} KB`,
)
