import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const NODES_DMP_PATH = path.join(__dirname, 'taxonomyBuilder', 'nodes.dmp')
const SEARCH_INDEX_PATH = path.join(__dirname, 'public', 'searchIndex.json')
const OUTPUT_PATH = path.join(__dirname, 'public', 'taxonomyFilter.json')

// Ordered from specific to broad for display purposes
const CURATED_CLADES = [
  { label: 'Mammalia', taxonId: 40674 },
  { label: 'Aves', taxonId: 8782 },
  { label: 'Actinopterygii', taxonId: 7898 },
  { label: 'Vertebrata', taxonId: 7742 },
  { label: 'Arthropoda', taxonId: 6656 },
  { label: 'Metazoa', taxonId: 33208 },
  { label: 'Viridiplantae', taxonId: 33090 },
  { label: 'Fungi', taxonId: 4751 },
  { label: 'Bacteria', taxonId: 2 },
  { label: 'Archaea', taxonId: 2157 },
  { label: 'Viruses', taxonId: 10239 },
]

function ensureNodesDmp() {
  if (fs.existsSync(NODES_DMP_PATH)) {
    return
  }
  const destDir = path.dirname(NODES_DMP_PATH).replaceAll('\\', '\\\\')
  console.log('nodes.dmp not found, downloading from NCBI...')
  execSync(
    `python3 -c "
import urllib.request, zipfile, io
print('Downloading taxdmp.zip from NCBI...')
data = urllib.request.urlopen('https://ftp.ncbi.nlm.nih.gov/pub/taxonomy/taxdmp.zip').read()
z = zipfile.ZipFile(io.BytesIO(data))
z.extract('nodes.dmp', '${destDir}')
print('Extracted nodes.dmp')
"`,
    { stdio: 'inherit' },
  )
}

async function buildChildrenMap(
  filePath: string,
): Promise<Map<number, number[]>> {
  const childrenMap = new Map<number, number[]>()
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    const parts = line.split('\t|\t')
    if (parts.length < 2) {
      continue
    }
    const taxId = parseInt(parts[0]!)
    const parentId = parseInt(parts[1]!)
    if (isNaN(taxId) || isNaN(parentId) || taxId === parentId) {
      continue
    }
    const existing = childrenMap.get(parentId)
    if (existing) {
      existing.push(taxId)
    } else {
      childrenMap.set(parentId, [taxId])
    }
  }
  return childrenMap
}

function collectDescendants(
  rootId: number,
  childrenMap: Map<number, number[]>,
): Set<number> {
  const result = new Set<number>()
  const stack = [rootId]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (result.has(current)) {
      continue
    }
    result.add(current)
    const children = childrenMap.get(current)
    if (children) {
      for (const child of children) {
        stack.push(child)
      }
    }
  }
  return result
}

ensureNodesDmp()

const searchIndex = JSON.parse(fs.readFileSync(SEARCH_INDEX_PATH, 'utf-8')) as [
  string,
  string,
  string,
  string,
  string,
  string,
  number,
][]

const indexTaxonIds = new Set(searchIndex.map(e => e[6]).filter(id => id > 0))
console.log(
  `Search index: ${searchIndex.length} entries, ${indexTaxonIds.size} unique taxonIds`,
)

console.log('Parsing nodes.dmp...')
const childrenMap = await buildChildrenMap(NODES_DMP_PATH)
console.log(`Built children map with ${childrenMap.size} parent nodes`)

const result: Record<string, number[]> = {}
for (const { label, taxonId } of CURATED_CLADES) {
  const allDescendants = collectDescendants(taxonId, childrenMap)
  const members: number[] = []
  for (const id of indexTaxonIds) {
    if (allDescendants.has(id)) {
      members.push(id)
    }
  }
  result[label] = members
  console.log(
    `  ${label} (taxonId ${taxonId}): ${members.length} matching taxonIds`,
  )
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result))
const sizeKB = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(0)
console.log(`Wrote ${OUTPUT_PATH} (${sizeKB} KB)`)
