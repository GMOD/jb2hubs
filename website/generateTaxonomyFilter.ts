import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

import { CURATED_CLADES } from './src/lib/taxonomyClades.ts'

import type { IndexEntry } from './src/lib/searchIndex.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TAXDUMP_DIR = path.join(__dirname, 'taxonomyBuilder')
const NODES_DMP_PATH = path.join(TAXDUMP_DIR, 'nodes.dmp')
const MERGED_DMP_PATH = path.join(TAXDUMP_DIR, 'merged.dmp')
const SEARCH_INDEX_PATH = path.join(__dirname, 'public', 'searchIndex.json')
const OUTPUT_PATH = path.join(__dirname, 'public', 'taxonomyFilter.json')

async function readMerged(filePath: string) {
  const merged = new Map<number, number>()
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    const [oldId, newId] = line.split('\t|\t')
    if (oldId && newId) {
      merged.set(parseInt(oldId), parseInt(newId))
    }
  }
  return merged
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

execFileSync(path.join(TAXDUMP_DIR, 'fetchTaxdump.sh'), { stdio: 'inherit' })

const searchIndex = JSON.parse(
  fs.readFileSync(SEARCH_INDEX_PATH, 'utf-8'),
) as IndexEntry[]

const indexTaxonIds = new Set(searchIndex.map(e => e[6]).filter(id => id > 0))
console.error(
  `Search index: ${searchIndex.length} entries, ${indexTaxonIds.size} unique taxonIds`,
)

console.error('Parsing nodes.dmp...')
const childrenMap = await buildChildrenMap(NODES_DMP_PATH)
console.error(`Built children map with ${childrenMap.size} parent nodes`)
const merged = await readMerged(MERGED_DMP_PATH)

const result: Record<string, number[]> = {}
const empty: string[] = []
for (const { label, taxonId } of CURATED_CLADES) {
  const allDescendants = collectDescendants(taxonId, childrenMap)
  const members: number[] = []
  for (const id of indexTaxonIds) {
    if (allDescendants.has(merged.get(id) ?? id)) {
      members.push(id)
    }
  }
  result[label] = members
  if (members.length === 0) {
    empty.push(label)
  }
  console.error(
    `  ${label} (taxonId ${taxonId}): ${members.length} matching taxonIds`,
  )
}

if (empty.length > 0) {
  throw new Error(
    `No indexed genome falls under ${empty.join(', ')}; refusing to write ${OUTPUT_PATH} from a truncated nodes.dmp or search index`,
  )
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result))
const sizeKB = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(0)
console.error(`Wrote ${OUTPUT_PATH} (${sizeKB} KB)`)
