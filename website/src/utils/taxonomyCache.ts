import fs from 'fs'
import path from 'path'

// A node exactly as it comes out of the Newick text, before the display pass.
interface ParsedNode {
  name?: string
  accession?: string
  taxonId?: string
  children?: ParsedNode[]
  branchLength?: number
}

// What TreeNode.astro renders. The only thing it adds to the parse is `depth`,
// which the renderer zebra-stripes by; the tree is otherwise passed through.
export interface TaxonomyNode {
  name?: string
  accession?: string
  taxonId?: string
  branchLength?: number
  children?: TaxonomyNode[]
  depth: number
}

// In-memory cache for parsed trees
const treeCache = new Map<string, TaxonomyNode>()

// Simple Newick parser
function parseNewick(newick: string): ParsedNode | null {
  const cleanNewick = newick.trim().replace(/;$/, '')
  if (!cleanNewick) {
    return null
  }

  let index = 0

  function parseNode(): ParsedNode {
    const children: ParsedNode[] = []
    const node: ParsedNode = { children }

    if (cleanNewick[index] === '(') {
      index++ // skip '('
      while (index < cleanNewick.length && cleanNewick[index] !== ')') {
        children.push(parseNode())
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
    // parseNode recurses once per level of nesting, so a pathologically deep
    // tree throws a RangeError here rather than taking the whole build down.
    console.error('Error parsing Newick string:', error)
    return null
  }
}

// Resolve each node's depth for rendering, collapsing the one redundancy the
// generated trees contain: an internal node whose single child is a leaf of the
// same name, which would otherwise draw the species twice, once as a collapsible
// group wrapping itself.
function toTaxonomyTree(root: ParsedNode): TaxonomyNode {
  function traverse(n: ParsedNode, depth: number): TaxonomyNode {
    const firstChild = n.children?.length === 1 ? n.children[0] : undefined
    if (
      firstChild?.accession &&
      !firstChild.children?.length &&
      n.name === firstChild.name
    ) {
      return {
        name: n.name,
        accession: firstChild.accession,
        taxonId: firstChild.taxonId,
        branchLength: firstChild.branchLength,
        children: undefined,
        depth,
      }
    }

    const children = (n.children ?? []).map(child => traverse(child, depth + 1))
    return {
      name: n.name,
      accession: n.accession,
      taxonId: n.taxonId,
      branchLength: n.branchLength,
      children: children.length > 0 ? children : undefined,
      depth,
    }
  }

  return traverse(root, 0)
}

// Every taxon the tree names, in both node forms it writes: leaves as
// Name[accession|taxonId] and internal nodes as Name{taxonId}. Read off the text
// rather than walked out of the parsed tree, since that is also how the tree is
// written, so the two stay in step.
//
// It lives here rather than in the frontmatter of the page that calls it because
// Astro extracts getStaticPaths into a module of its own and tree-shakes the
// rest of the frontmatter away — a helper defined beside it is a ReferenceError
// at build time, and the route silently produces no paths at all.
export function taxonIdsIn(newick: string) {
  const ids = new Set<string>()
  for (const [, id] of newick.matchAll(/\[[^|\]]+\|(\d+)\]/g)) {
    ids.add(id!)
  }
  for (const [, id] of newick.matchAll(/\{(\d+)\}/g)) {
    ids.add(id!)
  }
  return ids
}

// Newick text -> the tree the pages render. Exported as the pure seam the tests
// drive: everything else here either reads a file or memoizes, and the parse
// rules (the two bracket forms, the collapse, the depths) are the part with
// behaviour worth pinning down.
export function parseTaxonomyNewick(newick: string): TaxonomyNode | null {
  const parsed = parseNewick(newick)
  return parsed ? toTaxonomyTree(parsed) : null
}

/**
 * Get parsed tree from cache or parse and cache it
 * This function is called during build time and caches the parsed tree structure
 * in memory to avoid re-parsing for every page
 */
export function getCachedTree(category: string): TaxonomyNode | null {
  // Check if we already have it cached
  const cached = treeCache.get(category)
  if (cached) {
    return cached
  }

  // Not cached, so read and parse it
  const newickPath = path.join(
    process.cwd(),
    'public',
    'taxonomy',
    `${category}.newick`,
  )

  try {
    const tree = parseTaxonomyNewick(fs.readFileSync(newickPath, 'utf-8'))

    if (!tree) {
      console.error(`Failed to parse Newick data for category: ${category}`)
      return null
    }

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
  subtree: (taxonId: string) => TaxonomyNode | null
  // Root-to-node path, inclusive; empty when the tree has no such taxon.
  lineage: (taxonId: string) => TaxonomyNode[]
}

// Exported for the tests, which would otherwise have to go through a file read
// to reach it. One DFS answers both lookups for every taxon. Rescanning the tree per page
// instead cost ~6ms each, which over the 74K taxonomy pages was ~7 minutes of
// every build. A taxonId occurring at more than one node resolves to the first
// in pre-order, as a from-the-root search did.
export function buildTaxonomyIndex(root: TaxonomyNode): TaxonomyIndex {
  const nodes = new Map<string, TaxonomyNode>()
  const parents = new Map<TaxonomyNode, TaxonomyNode>()

  function visit(node: TaxonomyNode, parent: TaxonomyNode | undefined) {
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
      const path: TaxonomyNode[] = []
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
export function collectAccessions(node: TaxonomyNode | null): string[] {
  const accessions: string[] = []

  function traverse(n: TaxonomyNode) {
    if (n.accession) {
      accessions.push(n.accession)
    }
    for (const child of n.children ?? []) {
      traverse(child)
    }
  }

  if (node) {
    traverse(node)
  }
  return accessions
}
