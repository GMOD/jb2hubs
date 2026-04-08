import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const allHubsPath = path.join(__dirname, 'processedHubJson/all.json')
const listPath = path.join(__dirname, 'src/list.json')
const outputPath = path.join(__dirname, 'public/searchIndex.json')

interface HubRecord {
  accession: string | null
  commonName: string | null
  scientificName: string | null
  ncbiAssemblyName: string | null
  assemblyStatus: string | null
  source: string | null
  taxonId: number | null
}

interface UcscGenome {
  organism: string | null
  scientificName: string | null
  description: string | null
  id: string | null
  taxId: number | null
}

const allHubs: HubRecord[] = JSON.parse(fs.readFileSync(allHubsPath, 'utf-8'))
const list = JSON.parse(fs.readFileSync(listPath, 'utf-8'))

// Compact format: array of arrays to avoid repeating key names 50K times
// [accession, commonName, scientificName, ncbiAssemblyName, assemblyStatus, source, taxonId]
const index = allHubs.map(h => [
  h.accession ?? '',
  h.commonName ?? '',
  h.scientificName ?? '',
  h.ncbiAssemblyName ?? '',
  h.assemblyStatus ?? '',
  h.source ?? '',
  h.taxonId ?? 0,
])

// Add UCSC genomes (hg38, mm39, etc.)
const ucscGenomes = list.ucscGenomes as Record<string, UcscGenome>
for (const [id, genome] of Object.entries(ucscGenomes)) {
  index.push([
    id,
    genome.organism ?? '',
    genome.scientificName ?? '',
    genome.description ?? '',
    '',
    'ucsc',
    genome.taxId ?? 0,
  ])
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(index))

const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(0)
// eslint-disable-next-line no-console
console.log(
  `Search index: ${index.length} entries (${allHubs.length} genark + ${Object.keys(ucscGenomes).length} ucsc), ${sizeKB} KB`,
)
