/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const allHubsPath = path.join(__dirname, 'processedHubJson/all.json')
const outputPath = path.join(__dirname, 'public/ortholog_index.json')

interface HubRecord {
  accession: string | null
  commonName: string | null
  scientificName: string | null
  taxonId: number | null
}

const allHubs: HubRecord[] = JSON.parse(fs.readFileSync(allHubsPath, 'utf-8'))

// Only GCF (RefSeq) assemblies have NCBI gene annotations that appear in
// ortholog databases. NCBI Datasets API returns GCF accessions in its ortholog
// responses.
// Format: { accession: [commonName, scientificName, taxonId] }
const index: Record<string, [string, string, number]> = {}
for (const hub of allHubs) {
  if (!hub.accession?.startsWith('GCF_')) {
    continue
  }
  index[hub.accession] = [
    hub.commonName ?? '',
    hub.scientificName ?? '',
    hub.taxonId ?? 0,
  ]
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(index))

const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0)
console.log(
  `Ortholog index: ${Object.keys(index).length} GCF assemblies, ${sizeKB} KB`,
)
