/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ── Types ─────────────────────────────────────────────────────────────────────

interface TreeNode {
  name?: string
  accession?: string
  taxonId?: string
  children?: TreeNode[]
  branchLength?: number
}

interface FlatNodeData {
  id: string
  name?: string
  accession?: string
  taxonId?: string
  branchLength?: number
  children?: FlatNodeData[]
  depth: number
  isLeaf: boolean
}

interface RowData {
  accession: string
  commonName: string
  scientificName: string
  ncbiAssemblyName: string
  ncbiRefSeqCategory: string
  suppressed: boolean
  jbrowseLink: string
  assemblyStatus: string
  seqReleaseDate: string
  taxonId: string
  submitterOrg: string
}

export interface TaxonomyDataFile {
  title: string
  taxonId?: string
  category?: string
  subtree: FlatNodeData
  lineage: FlatNodeData[]
  rows: RowData[]
}

// ── Newick parser (same logic as taxonomyCache.ts) ────────────────────────────

function parseNewick(newick: string): TreeNode | null {
  const clean = newick.trim().replace(/;$/, '')
  if (!clean) return null
  let i = 0

  function parseNode(): TreeNode {
    const node: TreeNode = { children: [] }
    if (clean[i] === '(') {
      i++
      while (i < clean.length && clean[i] !== ')') {
        node.children!.push(parseNode())
        if (clean[i] === ',') i++
      }
      if (clean[i] === ')') i++
    }
    let name = ''
    while (i < clean.length && clean[i] !== ',' && clean[i] !== ')' && clean[i] !== '(' && clean[i] !== ':') {
      name += clean[i++]
    }
    if (name) {
      const accMatch = /^(.+?)\[([^\]]+)\]$/.exec(name)
      if (accMatch) {
        node.name = accMatch[1]
        const bracket = accMatch[2]!
        if (bracket.includes('|')) {
          const [acc, tid] = bracket.split('|') as [string, string]
          node.accession = acc
          node.taxonId = tid
        } else {
          node.accession = bracket
        }
      } else {
        const intMatch = /^(.+?)\{([^}]+)\}$/.exec(name)
        if (intMatch) {
          node.name = intMatch[1]
          node.taxonId = intMatch[2]
        } else {
          node.name = name
        }
      }
    }
    if (clean[i] === ':') {
      i++
      let len = ''
      while (i < clean.length && clean[i] !== ',' && clean[i] !== ')' && clean[i] !== '(') {
        len += clean[i++]
      }
      node.branchLength = parseFloat(len) || 0
    }
    return node
  }

  try {
    return parseNode()
  } catch {
    return null
  }
}

function toFlat(node: TreeNode): FlatNodeData {
  let counter = 0
  function traverse(n: TreeNode, depth: number): FlatNodeData {
    const id = `node_${counter++}`
    if (n.children?.length === 1) {
      const c = n.children[0]!
      if ((!c.children || c.children.length === 0) && n.name === c.name && c.accession) {
        return { id, name: n.name, accession: c.accession, taxonId: c.taxonId, branchLength: c.branchLength, depth, isLeaf: true }
      }
    }
    const children = n.children?.length ? n.children.map(c => traverse(c, depth + 1)) : undefined
    return { id, name: n.name, accession: n.accession, taxonId: n.taxonId, branchLength: n.branchLength, children, depth, isLeaf: !n.children || n.children.length === 0 }
  }
  return traverse(node, 0)
}

// ── DFS: build all taxon data in one pass ────────────────────────────────────

function buildAll(
  node: FlatNodeData,
  path: FlatNodeData[],
  accMap: Map<string, RowData>,
  out: Map<string, TaxonomyDataFile>,
): RowData[] {
  path.push(node)

  const rows: RowData[] = []
  if (node.accession) {
    const r = accMap.get(node.accession)
    if (r) rows.push(r)
  }
  if (node.children) {
    for (const child of node.children) {
      const childRows = buildAll(child, path, accMap, out)
      for (const r of childRows) rows.push(r)
    }
  }

  if (node.taxonId) {
    out.set(node.taxonId, {
      title: node.name ?? node.taxonId,
      taxonId: node.taxonId,
      subtree: node,
      lineage: [...path],
      rows,
    })
  }

  path.pop()
  return rows
}

// ── Main ──────────────────────────────────────────────────────────────────────

const allJsonPath = path.join(__dirname, 'processedHubJson', 'all.json')
const newickDir = path.join(__dirname, 'public', 'taxonomy')
const outDir = path.join(__dirname, 'public', 'taxonomy-data')
fs.mkdirSync(outDir, { recursive: true })

// Build accession map from all.json
const allAssemblies = JSON.parse(fs.readFileSync(allJsonPath, 'utf-8')) as Record<string, unknown>[]
const accMap = new Map<string, RowData>()
for (const a of allAssemblies) {
  if (a.accession) {
    accMap.set(a.accession as string, a as unknown as RowData)
  }
}
console.log(`Loaded ${accMap.size} assemblies`)

// Process all.newick → per-taxon JSON files
console.log('Parsing all.newick...')
const allNewick = fs.readFileSync(path.join(newickDir, 'all.newick'), 'utf-8')
const allRoot = parseNewick(allNewick)
if (!allRoot) throw new Error('Failed to parse all.newick')
const allTree = toFlat(allRoot)

console.log('Building per-taxon data files...')
const taxonData = new Map<string, TaxonomyDataFile>()
buildAll(allTree, [], accMap, taxonData)

let written = 0
for (const [taxonId, data] of taxonData) {
  fs.writeFileSync(path.join(outDir, `${taxonId}.json`), JSON.stringify(data))
  written++
}
console.log(`Wrote ${written} taxon data files`)

// Process category newick files → per-category JSON files
const categories = fs.readdirSync(newickDir)
  .filter(f => f.endsWith('.newick') && f !== 'all.newick')
  .map(f => f.replace('.newick', ''))

for (const category of categories) {
  const newickPath = path.join(newickDir, `${category}.newick`)
  const catJsonPath = path.join(__dirname, 'processedHubJson', `${category}.json`)
  if (!fs.existsSync(catJsonPath)) continue

  const newick = fs.readFileSync(newickPath, 'utf-8')
  const root = parseNewick(newick)
  if (!root) { console.warn(`Failed to parse ${category}.newick`); continue }
  const tree = toFlat(root)

  const catRows: RowData[] = []
  const catAccessions = new Set<string>()
  const catData = JSON.parse(fs.readFileSync(catJsonPath, 'utf-8')) as Record<string, unknown>[]
  for (const a of catData) {
    if (a.accession && !catAccessions.has(a.accession as string)) {
      catAccessions.add(a.accession as string)
      catRows.push(a as unknown as RowData)
    }
  }

  const file: TaxonomyDataFile = {
    title: category.charAt(0).toUpperCase() + category.slice(1),
    category,
    subtree: tree,
    lineage: [],
    rows: catRows,
  }
  fs.writeFileSync(path.join(outDir, `${category}.json`), JSON.stringify(file))
  console.log(`  ${category}: ${catRows.length} assemblies`)
}

console.log('Done')
