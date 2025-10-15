import fs from 'fs'
import path from 'path'

interface TreeNode {
  name?: string
  accession?: string
  taxonId?: string
  children?: TreeNode[]
  branchLength?: number
  parent?: TreeNode
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
  if (!cleanNewick) return null

  let index = 0

  function parseNode(): TreeNode {
    const node: TreeNode = { children: [] }

    if (cleanNewick[index] === '(') {
      index++ // skip '('
      do {
        const child = parseNode()
        child.parent = node
        node.children!.push(child)
        if (cleanNewick[index] === ',') {
          index++ // skip ','
        }
      } while (
        cleanNewick[index] === ',' ||
        (cleanNewick[index] !== ')' && index < cleanNewick.length)
      )
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
      const accessionMatch = name.match(/^(.+?)\[([^\]]+)\]$/)
      if (accessionMatch) {
        node.name = accessionMatch[1]
        const bracketContent = accessionMatch[2]
        // Check if bracket content contains taxonId (format: accession|taxonId)
        if (bracketContent.includes('|')) {
          const [accession, taxonId] = bracketContent.split('|')
          node.accession = accession
          node.taxonId = taxonId
        } else {
          node.accession = bracketContent
        }
      } else {
        // Check for internal node format: Name{taxonId}
        const internalMatch = name.match(/^(.+?)\{([^\}]+)\}$/)
        if (internalMatch) {
          node.name = internalMatch[1]
          node.taxonId = internalMatch[2]
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
    // If it has exactly one child that is a leaf with the same name, skip the intermediate node
    if (
      n.children &&
      n.children.length === 1 &&
      (!n.children[0].children || n.children[0].children.length === 0) && // child is a leaf
      n.name === n.children[0].name && // names match
      n.children[0].accession // child has an accession
    ) {
      // Collapse: use the child's accession but keep the parent's position in tree
      return {
        id,
        name: n.name,
        accession: n.children[0].accession, // Promote child's accession
        taxonId: n.children[0].taxonId, // Promote child's taxonId
        branchLength: n.children[0].branchLength,
        children: undefined,
        depth,
        isLeaf: true,
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

/**
 * Extract subtree for a specific taxonId
 */
export function extractSubtreeByTaxonId(
  node: FlatNodeData | null,
  targetTaxonId: string,
): FlatNodeData | null {
  if (!node) return null

  // Check if current node matches the taxonId
  if (node.taxonId === targetTaxonId) {
    return node
  }

  // Check if any child matches
  if (node.children) {
    for (const child of node.children) {
      const result = extractSubtreeByTaxonId(child, targetTaxonId)
      if (result) return result
    }
  }

  return null
}

/**
 * Extract lineage (path from root to target node)
 */
export function extractLineageByTaxonId(
  node: FlatNodeData | null,
  targetTaxonId: string,
): FlatNodeData[] {
  if (!node) return []

  // Check if current node matches the taxonId
  if (node.taxonId === targetTaxonId) {
    return [node]
  }

  // Check if any child's lineage contains the target
  if (node.children) {
    for (const child of node.children) {
      const childLineage = extractLineageByTaxonId(child, targetTaxonId)
      if (childLineage.length > 0) {
        // Found it! Prepend current node to the lineage
        return [node, ...childLineage]
      }
    }
  }

  return []
}

/**
 * Count accessions in a tree
 */
export function countAccessions(node: FlatNodeData | null): number {
  if (!node) return 0
  let count = node.accession ? 1 : 0
  if (node.children) {
    for (const child of node.children) {
      count += countAccessions(child)
    }
  }
  return count
}

export type { FlatNodeData }
