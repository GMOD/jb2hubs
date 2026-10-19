import fs from 'fs'
import path from 'path'

import { isEnoent } from './readJson.ts'

// A node exactly as it comes out of the Newick text, before the display pass.
interface ParsedNode {
  name?: string
  accession?: string
  taxonId?: string
  children?: ParsedNode[]
  branchLength?: number
}

// What TreeNode.astro renders. The parse adds `depth`, which the renderer
// zebra-stripes by; budgetTree adds `hiddenAccessions` to a node whose subtree
// it cut, which the renderer draws as a count linking to that node's own page.
export interface TaxonomyNode {
  name?: string
  accession?: string
  taxonId?: string
  branchLength?: number
  children?: TaxonomyNode[]
  depth: number
  hiddenAccessions?: number
}

const treeCache = new Map<string, TaxonomyNode>()

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

    // build_taxonomy.py single-quotes a label holding a delimiter ("Marburg
    // virus - Musoke, Kenya, 1980", "HM-1:IMSS") and doubles a quote inside it.
    let name = ''
    if (cleanNewick[index] === "'") {
      index++
      while (index < cleanNewick.length) {
        if (cleanNewick[index] === "'") {
          if (cleanNewick[index + 1] !== "'") {
            index++
            break
          }
          index++
        }
        name += cleanNewick[index]
        index++
      }
    }
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

  // parseNode recurses once per level of nesting, so a pathologically deep
  // tree overflows the stack
  try {
    return parseNode()
  } catch (error) {
    if (error instanceof RangeError) {
      console.error('Error parsing Newick string:', error)
      return null
    }
    throw error
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

// The parsed tree for public/taxonomy/<category>.newick, read once per build;
// null when the file is absent or empty
export function getCachedTree(category: string): TaxonomyNode | null {
  const cached = treeCache.get(category)
  if (cached) {
    return cached
  }
  const newickPath = path.join(
    process.cwd(),
    'public',
    'taxonomy',
    `${category}.newick`,
  )
  let text: string
  try {
    text = fs.readFileSync(newickPath, 'utf-8')
  } catch (err) {
    if (isEnoent(err)) {
      return null
    }
    throw err
  }
  const tree = parseTaxonomyNewick(text)
  if (!tree) {
    console.error(`Failed to parse Newick data for category: ${category}`)
    return null
  }
  treeCache.set(category, tree)
  return tree
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

// Nodes server-rendered per taxonomy page. /taxonomy/1 held all 89K in 80MB of
// HTML; at ~700 bytes a row this keeps every page under about half a megabyte,
// and a cut node links to its own page, where it is the root and gets the
// budget. Lives here rather than in the page for the same reason taxonIdsIn
// does: getStaticPaths is extracted from the frontmatter and loses its
// neighbours.
export const TREE_NODE_BUDGET = 500

// The rendered form of a subtree, cut to at most `maxNodes` nodes. Whole levels
// are taken in order — the root's own children always, then each deeper level
// while the total still fits — so a thin chain (the ~15 single-child ranks
// between Eukaryota and any mammal) renders deep while a bushy one stops early.
// A node whose children were cut keeps none and records how many assemblies
// sit beneath it. The input is not modified: it is the shared, cached tree.
//
// Before this, /taxonomy/1 server-rendered all 89K nodes into 80MB of HTML,
// and every accession page's breadcrumb links to it.
export function budgetTree(root: TaxonomyNode, maxNodes: number): TaxonomyNode {
  const copy = (node: TaxonomyNode): TaxonomyNode => ({
    ...node,
    children: undefined,
  })
  const out = copy(root)
  let frontier: { source: TaxonomyNode; target: TaxonomyNode }[] = [
    { source: root, target: out },
  ]
  let rendered = 1
  let level = 0
  while (frontier.length > 0) {
    const next: typeof frontier = []
    let levelSize = 0
    for (const { source } of frontier) {
      levelSize += source.children?.length ?? 0
    }
    if (level > 0 && rendered + levelSize > maxNodes) {
      for (const { source, target } of frontier) {
        if (source.children?.length) {
          target.hiddenAccessions = collectAccessions(source).length
        }
      }
      frontier = []
    } else {
      for (const { source, target } of frontier) {
        if (source.children?.length) {
          target.children = source.children.map(copy)
          for (const [i, child] of source.children.entries()) {
            next.push({ source: child, target: target.children[i]! })
          }
        }
      }
      rendered += levelSize
      frontier = next
      level += 1
    }
  }
  return out
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
