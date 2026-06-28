// Pure geometry for the MultiSyntenyView: turns an assembled Neighborhood into
// SVG-ready coordinates — tree-ordered rows of gene arrows, ribbons linking
// homologous genes between adjacent rows, and a cladogram on the left. No React,
// no DOM, so it is unit-testable and the component is a thin renderer over it.

import type { Anchor, Neighborhood, PlacedGene } from './neighborhood.ts'
import type { TaxonNode } from './multiSyntenyTaxonTree.ts'

export type LayoutMode = 'bp' | 'ordinal'

export interface LayoutOptions {
  mode: LayoutMode
  treeWidth: number
  labelWidth: number
  trackWidth: number
  rowHeight: number
  geneHeight: number
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  mode: 'bp',
  treeWidth: 140,
  labelWidth: 150,
  trackWidth: 620,
  rowHeight: 22,
  geneHeight: 12,
}

export interface GeneBox extends PlacedGene {
  x: number
  width: number
}

export interface RowLayout {
  taxonId: number
  label: string
  y: number // top of the row's gene track band
  genes: GeneBox[]
  translocated: number // anchors on a different scaffold (not drawn in-track)
}

// A filled band connecting one anchor's gene in the top row to the same anchor's
// gene in the row below, spanning each gene's width (so it reads as a ribbon, and
// crosses a neighbor's ribbon when the gene order differs = a rearrangement).
export interface Ribbon {
  anchorId: string
  color: string
  topY: number
  bottomY: number
  topLeft: number
  topRight: number
  bottomLeft: number
  bottomRight: number
}

export interface TreeEdge {
  x1: number
  y1: number
  x2: number
  y2: number
}

// A clickable internal cladogram node: its position plus every leaf taxon under
// it, so clicking launches a synteny view of that whole subtree.
export interface TreeNodeHit {
  x: number
  y: number
  leafTaxonIds: number[]
}

export interface MultiSyntenyLayout {
  rows: RowLayout[]
  ribbons: Ribbon[]
  treeEdges: TreeEdge[]
  treeNodes: TreeNodeHit[]
  anchorColors: Map<string, string>
  trackLeft: number
  width: number
  height: number
}

// Distinct, stable hues per anchor (the query gene is always the first anchor).
const PALETTE = [
  '#d62728', // query — red
  '#1f77b4',
  '#2ca02c',
  '#9467bd',
  '#ff7f0e',
  '#17becf',
  '#8c564b',
  '#e377c2',
  '#bcbd22',
  '#7f7f7f',
  '#393b79',
  '#637939',
]

function anchorColorMap(anchors: Anchor[]) {
  return new Map(
    anchors.map((a, i) => [a.geneId, PALETTE[i % PALETTE.length]!]),
  )
}

// The scaffold a row is laid out on: the query gene's scaffold if present, else
// the one carrying the most anchors. Genes elsewhere are counted as translocated.
function dominantRefName(genes: PlacedGene[], queryAnchorId: string) {
  const query = genes.find(g => g.anchorId === queryAnchorId)
  if (query) {
    return query.refName
  }
  const counts = new Map<string, number>()
  for (const g of genes) {
    counts.set(g.refName, (counts.get(g.refName) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
}

function placeBp(genes: PlacedGene[], trackLeft: number, trackWidth: number) {
  const min = Math.min(...genes.map(g => g.start))
  const max = Math.max(...genes.map(g => g.end))
  const span = Math.max(1, max - min)
  const scale = trackWidth / span
  return genes.map((g): GeneBox => {
    const x = trackLeft + (g.start - min) * scale
    return { ...g, x, width: Math.max(3, (g.end - g.start) * scale) }
  })
}

function placeOrdinal(
  genes: PlacedGene[],
  trackLeft: number,
  trackWidth: number,
  slots: number,
) {
  const slotW = trackWidth / Math.max(1, slots)
  const ascending = [...genes].sort((a, b) => a.start - b.start)
  return ascending.map(
    (g, i): GeneBox => ({
      ...g,
      x: trackLeft + i * slotW + slotW * 0.1,
      width: slotW * 0.8,
    }),
  )
}

// Cladogram (rectangular): leaves sit at their row y, internal nodes at the mean
// of their children, x by normalized depth. Returns edges to draw plus internal
// nodes (position + their leaf taxa) as launch targets for subtree synteny.
function layoutTree(
  tree: TaxonNode | undefined,
  rowY: Map<number, number>,
  treeWidth: number,
) {
  const edges: TreeEdge[] = []
  const nodes: TreeNodeHit[] = []
  if (!tree) {
    return { edges, nodes }
  }
  let maxDepth = 0
  function depthOf(node: TaxonNode, d: number) {
    maxDepth = Math.max(maxDepth, d)
    node.children.forEach(c => depthOf(c, d + 1))
  }
  depthOf(tree, 0)
  const xAt = (d: number) => (maxDepth === 0 ? 0 : (d / maxDepth) * treeWidth)

  function place(
    node: TaxonNode,
    depth: number,
  ): { y: number; leaves: number[] } | undefined {
    if (node.children.length === 0) {
      const y = rowY.get(node.taxonId)
      return y === undefined ? undefined : { y, leaves: [node.taxonId] }
    }
    const kids = node.children
      .map(c => place(c, depth + 1))
      .filter((r): r is { y: number; leaves: number[] } => r !== undefined)
    if (kids.length === 0) {
      return undefined
    }
    const x = xAt(depth)
    for (const kid of kids) {
      edges.push({ x1: x, y1: kid.y, x2: xAt(depth + 1), y2: kid.y }) // horizontal
    }
    edges.push({ x1: x, y1: kids[0]!.y, x2: x, y2: kids.at(-1)!.y }) // vertical
    const y = kids.reduce((s, k) => s + k.y, 0) / kids.length
    const leaves = kids.flatMap(k => k.leaves)
    nodes.push({ x, y, leafTaxonIds: leaves })
    return { y, leaves }
  }
  place(tree, 0)
  return { edges, nodes }
}

// gggenes-style arrow path: rectangular body with a triangular head on the
// strand end, collapsing to a triangle when the gene is narrower than the head.
// Coordinates are local to the row (translate the group to the row's y).
export function geneArrowPath(g: GeneBox, h: number) {
  const head = Math.min(h, g.width)
  const x = g.x
  const r = g.x + g.width
  return g.strand > 0
    ? `M${x},0 L${r - head},0 L${r},${h / 2} L${r - head},${h} L${x},${h} Z`
    : `M${r},0 L${x + head},0 L${x},${h / 2} L${x + head},${h} L${r},${h} Z`
}

// Filled band with bezier sides connecting a gene to its ortholog one row down.
export function ribbonPath(r: Ribbon) {
  const my = (r.topY + r.bottomY) / 2
  return [
    `M${r.topLeft},${r.topY}`,
    `C${r.topLeft},${my} ${r.bottomLeft},${my} ${r.bottomLeft},${r.bottomY}`,
    `L${r.bottomRight},${r.bottomY}`,
    `C${r.bottomRight},${my} ${r.topRight},${my} ${r.topRight},${r.topY}`,
    'Z',
  ].join(' ')
}

export function layoutNeighborhood(
  nb: Neighborhood,
  options: Partial<LayoutOptions> = {},
): MultiSyntenyLayout {
  const opt = { ...DEFAULT_LAYOUT, ...options }
  const trackLeft = opt.treeWidth + opt.labelWidth
  const anchorColors = anchorColorMap(nb.anchors)
  const centerOffset = (opt.rowHeight - opt.geneHeight) / 2

  const rows: RowLayout[] = nb.species.map((s, i) => {
    const y = i * opt.rowHeight
    const ref = dominantRefName(s.genes, nb.query.geneId)
    const onScaffold = s.genes.filter(g => g.refName === ref)
    const placed =
      onScaffold.length === 0
        ? []
        : opt.mode === 'bp'
          ? placeBp(onScaffold, trackLeft, opt.trackWidth)
          : placeOrdinal(
              onScaffold,
              trackLeft,
              opt.trackWidth,
              nb.anchors.length,
            )
    return {
      taxonId: s.taxonId,
      label: s.commonName || s.scientificName || String(s.taxonId),
      y: y + centerOffset,
      genes: placed,
      translocated: s.genes.length - onScaffold.length,
    }
  })

  // Ribbons connect the same anchor between consecutive rows.
  const ribbons: Ribbon[] = []
  for (let i = 0; i < rows.length - 1; i++) {
    const top = rows[i]!
    const bottom = rows[i + 1]!
    const bottomByAnchor = new Map(bottom.genes.map(g => [g.anchorId, g]))
    for (const g of top.genes) {
      const b = bottomByAnchor.get(g.anchorId)
      if (b) {
        ribbons.push({
          anchorId: g.anchorId,
          color: anchorColors.get(g.anchorId) ?? '#999',
          topY: top.y + opt.geneHeight,
          bottomY: bottom.y,
          topLeft: g.x,
          topRight: g.x + g.width,
          bottomLeft: b.x,
          bottomRight: b.x + b.width,
        })
      }
    }
  }

  const rowY = new Map(
    rows.map(r => [r.taxonId, r.y + opt.geneHeight / 2] as const),
  )
  const { edges: treeEdges, nodes: treeNodes } = layoutTree(
    nb.tree,
    rowY,
    opt.treeWidth,
  )

  return {
    rows,
    ribbons,
    treeEdges,
    treeNodes,
    anchorColors,
    trackLeft,
    width: trackLeft + opt.trackWidth + 12,
    height: rows.length * opt.rowHeight,
  }
}
