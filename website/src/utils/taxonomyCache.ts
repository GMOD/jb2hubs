import fs from 'fs'
import path from 'path'

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

// In-memory cache for parsed trees
const treeCache = new Map<string, FlatNodeData>()

// Simple Newick parser
function parseNewick(newick: string): TreeNode | null {
  const cleanNewick = newick.trim().replace(/;$/, '')
  if (!cleanNewick) {
    return null
  }

  let index = 0

  function parseNode(): TreeNode {
    const node: TreeNode = { children: [] }

    if (cleanNewick[index] === '(') {
      index++ // skip '('
      while (index < cleanNewick.length && cleanNewick[index] !== ')') {
        const child = parseNode()
        node.children!.push(child)
        if (cleanNewick[index] === ',') {
          index++ // skip ','
        }
      }
      if (cleanNewick[index] === ')') {
        index++ // skip ')'
      }
    }

    // Parse node name
    let name = ''
    while (
      index < cleanNewick.length &&
      cleanNewick[index] !== ',' &&
      cleanNewick[index] !== ')' &&
      cleanNewick[index] !== '(' &&
      cleanNewick[index] !== ':'
    ) {
      name += cleanNewick[index]
      index++
    }

    if (name) {
      // First check for leaf node format: Name[accession|taxonId]
      const accessionMatch = /^(.+?)\[([^\]]+)\]$/.exec(name)
      if (accessionMatch) {
        node.name = accessionMatch[1]!
        const bracketContent = accessionMatch[2]!
        // Check if bracket content contains taxonId (format: accession|taxonId)
        if (bracketContent.includes('|')) {
          const [accession, taxonId] = bracketContent.split('|') as [
            string,
            string,
          ]
          node.accession = accession
          node.taxonId = taxonId
        } else {
          node.accession = bracketContent
        }
      } else {
        // Check for internal node format: Name{taxonId}

        const internalMatch = /^(.+?)\{([^}]+)\}$/.exec(name)
        if (internalMatch) {
          node.name = internalMatch[1]!
          node.taxonId = internalMatch[2]!
        } else {
          node.name = name
        }
      }
    }

    // Parse branch length
    if (cleanNewick[index] === ':') {
      index++ // skip ':'
      let lengthStr = ''
      while (
        index < cleanNewick.length &&
        cleanNewick[index] !== ',' &&
        cleanNewick[index] !== ')' &&
        cleanNewick[index] !== '('
      ) {
        lengthStr += cleanNewick[index]
        index++
      }
      node.branchLength = parseFloat(lengthStr) || 0
    }

    return node
  }

  try {
    return parseNode()
  } catch (error) {
    console.error('Error parsing Newick string:', error)
    return null
  }
}

// Convert TreeNode to hierarchical structure with IDs
function convertToHierarchicalTree(node: TreeNode): FlatNodeData {
  let nodeCounter = 0

  function traverse(n: TreeNode, depth: number): FlatNodeData {
    const id = `node_${nodeCounter++}`

    // Check if this node should be collapsed:
    // If it has exactly one child that is a leaf with the same name, skip the
    // intermediate node
    if (n.children?.length === 1) {
      const firstChild = n.children[0]!
      if (
        (!firstChild.children || firstChild.children.length === 0) &&
        n.name === firstChild.name &&
        firstChild.accession
      ) {
        return {
          id,
          name: n.name,
          accession: firstChild.accession,
          taxonId: firstChild.taxonId,
          branchLength: firstChild.branchLength,
          children: undefined,
          depth,
          isLeaf: true,
        }
      }
    }

    // Normal case: process children
    const childNodes: FlatNodeData[] = []
    if (n.children && n.children.length > 0) {
      for (const child of n.children) {
        childNodes.push(traverse(child, depth + 1))
      }
    }

    return {
      id,
      name: n.name,
      accession: n.accession,
      taxonId: n.taxonId,
      branchLength: n.branchLength,
      children: childNodes.length > 0 ? childNodes : undefined,
      depth,
      isLeaf: !n.children || n.children.length === 0,
    }
  }

  return traverse(node, 0)
}

/**
 * Get parsed tree from cache or parse and cache it
 * This function is called during build time and caches the parsed tree structure
 * in memory to avoid re-parsing for every page
 */
export function getCachedTree(category: string): FlatNodeData | null {
  // Check if we already have it cached
  if (treeCache.has(category)) {
    return treeCache.get(category)!
  }

  // Not cached, so read and parse it
  const newickPath = path.join(
    process.cwd(),
    'public',
    'taxonomy',
    `${category}.newick`,
  )

  try {
    const newickData = fs.readFileSync(newickPath, 'utf-8')
    const parsedTree = parseNewick(newickData)

    if (!parsedTree) {
      console.error(`Failed to parse Newick data for category: ${category}`)
      return null
    }

    const tree = convertToHierarchicalTree(parsedTree)

    // Cache it for future use
    treeCache.set(category, tree)

    return tree
  } catch (err) {
    console.error(`Failed to read taxonomy file for category ${category}:`, err)
    return null
  }
}

export interface TaxonomyIndex {
  // The node a taxonomy page is rooted at, or null when the tree has no such
  // taxon.
  subtree: (taxonId: string) => FlatNodeData | null
  // Root-to-node path, inclusive; empty when the tree has no such taxon.
  lineage: (taxonId: string) => FlatNodeData[]
}

// One DFS answers both lookups for every taxon. Rescanning the tree per page
// instead cost ~6ms each, which over the 74K taxonomy pages was ~7 minutes of
// every build. A taxonId occurring at more than one node resolves to the first
// in pre-order, as a from-the-root search did.
function buildTaxonomyIndex(root: FlatNodeData): TaxonomyIndex {
  const nodes = new Map<string, FlatNodeData>()
  const parents = new Map<FlatNodeData, FlatNodeData>()

  function visit(node: FlatNodeData, parent: FlatNodeData | undefined) {
    if (node.taxonId !== undefined && !nodes.has(node.taxonId)) {
      nodes.set(node.taxonId, node)
    }
    if (parent) {
      parents.set(node, parent)
    }
    for (const child of node.children ?? []) {
      visit(child, node)
    }
  }
  visit(root, undefined)

  return {
    subtree: taxonId => nodes.get(taxonId) ?? null,
    lineage: taxonId => {
      const path: FlatNodeData[] = []
      let node = nodes.get(taxonId)
      while (node) {
        path.push(node)
        node = parents.get(node)
      }
      return path.reverse()
    },
  }
}

const indexCache = new Map<string, TaxonomyIndex>()

export function getTaxonomyIndex(category: string): TaxonomyIndex | null {
  let index = indexCache.get(category) ?? null
  if (!index) {
    const tree = getCachedTree(category)
    if (tree) {
      index = buildTaxonomyIndex(tree)
      indexCache.set(category, index)
    }
  }
  return index
}

/**
 * Collect all accessions from a subtree
 */
export function collectAccessions(node: FlatNodeData | null): string[] {
  if (!node) {
    return []
  }
  const accessions: string[] = []

  function traverse(n: FlatNodeData) {
    if (n.accession) {
      accessions.push(n.accession)
    }
    if (n.children) {
      for (const child of n.children) {
        traverse(child)
      }
    }
  }

  traverse(node)
  return accessions
}

export type { FlatNodeData }
