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
interface SubtreeEdge {
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
  const res = await ncbiFetch(FILTERED_SUBTREE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taxons: unique.map(String) }),
  })
  if (!res.ok) {
    throw new Error(`taxonomy subtree request failed (${res.status})`)
  }
  const json = (await res.json()) as SubtreeResponse
  const raw = json.edges ? buildInducedTree(json.edges, unique) : undefined
  return raw ? collapseChains(raw) : undefined
}
