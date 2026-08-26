// Tree-ordering for the multi-way synteny view. Given the taxon ids of an
// ortholog result set, fetch NCBI Datasets' induced subtree and prune it so the
// requested taxa are the leaves. A DFS over that tree yields a phylogenetically
// sensible row order (sister taxa adjacent), and the tree itself is drawn beside
// the rows (the ggtree-style sidebar).

import { ncbiFetch } from './ncbiFetch.ts'

export interface TaxonNode {
  taxonId: number
  name: string
  commonName?: string
  rank?: string
  children: TaxonNode[]
}

// Shape of the `edges` map in the filtered_subtree response: parent taxon id ->
// its children + display metadata. The tree is rooted at taxon id 1 ("root").
export interface SubtreeEdge {
  visible_children?: number[]
  scientific_name?: string
  curator_common_name?: string
  rank?: string
}

interface SubtreeResponse {
  edges?: Record<string, SubtreeEdge>
}

const FILTERED_SUBTREE =
  'https://api.ncbi.nlm.nih.gov/datasets/v2/taxonomy/filtered_subtree'

const ROOT_TAXON = 1

// Build the induced tree from the raw edges, pruned so each requested taxon is a
// leaf (NCBI keeps subspecies below e.g. Homo sapiens, which we don't want as
// extra rows) and branches that lead to no requested taxon are dropped.
export function buildInducedTree(
  edges: Record<string, SubtreeEdge>,
  taxonIds: number[],
): TaxonNode | undefined {
  const requested = new Set(taxonIds)

  function build(taxonId: number): TaxonNode | undefined {
    const edge = edges[String(taxonId)]
    const node: TaxonNode = {
      taxonId,
      name: edge?.scientific_name ?? String(taxonId),
      commonName: edge?.curator_common_name,
      rank: edge?.rank,
      children: [],
    }
    // Requested taxa terminate the descent so they render as leaves.
    if (requested.has(taxonId)) {
      return node
    }
    for (const child of edge?.visible_children ?? []) {
      const built = build(child)
      if (built) {
        node.children.push(built)
      }
    }
    return node.children.length > 0 ? node : undefined
  }

  return build(ROOT_TAXON)
}

// Collapse runs of single-child internal nodes (the long rank chain from root
// down to the lowest common ancestor) so the drawn tree shows only branch points.
export function collapseChains(node: TaxonNode): TaxonNode {
  let current = node
  while (current.children.length === 1 && current.children[0]) {
    current = current.children[0]
  }
  return { ...current, children: current.children.map(collapseChains) }
}

// Left-to-right leaf order = top-to-bottom row order.
export function leafOrder(node: TaxonNode): number[] {
  return node.children.length === 0
    ? [node.taxonId]
    : node.children.flatMap(leafOrder)
}

// The induced subtree's raw edges for a taxon set, or undefined when the API
// returns none. Both consumers below start here: the drawn tree, and the
// root-to-taxon lineages the ortholog table groups its rows by.
async function fetchSubtreeEdges(unique: number[]) {
  const res = await ncbiFetch(FILTERED_SUBTREE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taxons: unique.map(String) }),
  })
  if (!res.ok) {
    throw new Error(`taxonomy subtree request failed (${res.status})`)
  }
  return ((await res.json()) as SubtreeResponse).edges
}

// Fetch + build the induced, pruned, chain-collapsed tree for a taxon set. A
// taxon the API omits simply won't appear in the tree; the caller still renders
// its row (sorted after the tree-ordered ones), so no species is dropped.
export async function fetchInducedTree(
  taxonIds: number[],
): Promise<TaxonNode | undefined> {
  const unique = [...new Set(taxonIds)]
  if (unique.length === 0) {
    return undefined
  }
  const edges = await fetchSubtreeEdges(unique)
  const raw = edges ? buildInducedTree(edges, unique) : undefined
  return raw ? collapseChains(raw) : undefined
}

// taxonId -> the set of taxa on its root-to-leaf path, itself included. The
// subtree is rooted at taxon 1 and every edge names its visible children, so
// inverting that gives each taxon one parent and walking up gives the lineage —
// which is what lets a caller ask "is this species inside Primates" with an id
// test rather than a name match. Unlike the drawn tree this keeps the requested
// taxa as interior points too, so a taxon that is an ancestor of another still
// gets its own entry.
export function buildAncestors(
  edges: Record<string, SubtreeEdge>,
  taxonIds: number[],
): Map<number, Set<number>> {
  const parent = new Map<number, number>()
  for (const [id, edge] of Object.entries(edges)) {
    for (const child of edge.visible_children ?? []) {
      parent.set(child, Number(id))
    }
  }
  const ancestors = new Map<number, Set<number>>()
  for (const taxonId of taxonIds) {
    const path = new Set([taxonId])
    let up = parent.get(taxonId)
    // The root has no parent, so this terminates. The membership test is for a
    // cyclic or self-parented edge, which would otherwise hang the page.
    while (up !== undefined && !path.has(up)) {
      path.add(up)
      up = parent.get(up)
    }
    ancestors.set(taxonId, path)
  }
  return ancestors
}

// Root-to-taxon lineages for a taxon set. Every requested taxon gets an entry;
// one the API omits from the subtree comes back as a lineage of just itself,
// which lands it in whatever "other" bucket the caller ends its ladder with
// rather than dropping the row.
export async function fetchTaxonAncestors(taxonIds: number[]) {
  const unique = [...new Set(taxonIds)]
  const edges = unique.length > 0 ? await fetchSubtreeEdges(unique) : undefined
  return edges ? buildAncestors(edges, unique) : new Map<number, Set<number>>()
}
