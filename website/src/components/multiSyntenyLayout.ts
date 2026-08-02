// Pure geometry for the MultiSyntenyView: turns an assembled Neighborhood into
// SVG-ready coordinates — tree-ordered rows of gene arrows, ribbons linking
// homologous genes between adjacent rows, and a cladogram on the left. No React,
// no DOM, so it is unit-testable and the component is a thin renderer over it.

import type { TaxonNode } from './multiSyntenyTaxonTree.ts'
import type { Anchor, Neighborhood, PlacedGene } from './neighborhood.ts'

export type LayoutMode = 'bp' | 'ordinal'

export interface LayoutOptions {
  mode: LayoutMode
  treeWidth: number
  labelWidth: number
  trackWidth: number
  rowHeight: number
  geneHeight: number
  // Mirror each row whose query ortholog sits on the opposite strand from the
  // reference, so a whole-locus inversion reads as a flipped block rather than a
  // tangle of crossing ribbons.
  orientToRef: boolean
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  mode: 'bp',
  treeWidth: 140,
  labelWidth: 150,
  trackWidth: 620,
  rowHeight: 22,
  geneHeight: 12,
  orientToRef: true,
}

export interface GeneBox extends PlacedGene {
  x: number
  width: number
  // Arrow direction as drawn. Equals the genomic strand, except in a mirrored
  // (inverted) row where it is negated so the arrow points correctly in the
  // flipped frame. `strand` stays the genomic truth for tooltips.
  drawStrand: 1 | -1
}

export interface RowLayout {
  taxonId: number
  label: string
  y: number // top of the row's gene track band
  genes: GeneBox[]
  translocated: number // anchors on a different scaffold (not drawn in-track)
  inverted: boolean // row mirrored to match the reference's query orientation
  hasQuery: boolean // the query anchor's ortholog is present on this scaffold
  assembly: string // GCF accession of this row's genes (for JBrowse launch)
  refName: string // dominant scaffold the row is laid out on
  spanStart: number // genomic bounds of the drawn genes on that scaffold
  spanEnd: number
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
  geneHeight: number
}

// Distinct, stable hues per anchor (the query gene is always the first anchor).
// Long enough to give every anchor a unique color at the largest offered anchor
// count (21) before the modulo wraps.
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
  '#5254a3',
  '#8ca252',
  '#bd9e39',
  '#843c39',
  '#ad494a',
  '#7b4173',
  '#a55194',
  '#ce6dbd',
  '#6b6ecf',
  '#e7ba52',
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
    return {
      ...g,
      x,
      width: Math.max(3, (g.end - g.start) * scale),
      drawStrand: g.strand,
    }
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
      drawStrand: g.strand,
    }),
  )
}

// Decide whether a row's locus is inverted relative to the reference from the
// SIGN of its gene-order correlation, not a single gene's annotated strand. Among
// anchors shared with the reference, count concordant vs discordant ordered pairs
// (the sign of Kendall's tau): a locus read back-to-front is fully discordant.
// This is robust to arbitrary scaffold orientation across assemblies, where an
// individual ortholog's strand is not — orthologs routinely differ in strand
// without the surrounding locus being inverted. With too little order information
// (0 or 1 shared anchor, or a dead tie) fall back to the query gene's strand.
function isInverted(
  genes: PlacedGene[],
  refRank: Map<string, number>,
  queryAnchorId: string,
  canonicalStrand: 1 | -1,
): boolean {
  const ranked = genes
    .map(g => ({ pos: g.start, rank: refRank.get(g.anchorId) }))
    .filter((r): r is { pos: number; rank: number } => r.rank !== undefined)
    .sort((a, b) => a.pos - b.pos)
  let concordant = 0
  let discordant = 0
  for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const earlier = ranked[i]!.rank
      const later = ranked[j]!.rank
      if (later > earlier) {
        concordant++
      } else if (later < earlier) {
        discordant++
      }
    }
  }
  const query = genes.find(g => g.anchorId === queryAnchorId)
  const strandFallback = query !== undefined && query.strand !== canonicalStrand
  return concordant === discordant ? strandFallback : discordant > concordant
}

// Mirror placed genes so an inverted locus reads as a flipped block: reflect each
// gene across the row's own occupied span (not the full track) and negate the
// drawn arrow direction. Reflecting across the occupied span is what makes this
// correct in ordinal mode, where a row with fewer genes than anchors fills only
// the leftmost slots — reflecting across the whole track would fling it to the
// right and misalign its ribbons. In bp mode the extreme genes already touch both
// track edges, so the occupied span equals the track and the result is unchanged.
function mirrorRow(genes: GeneBox[]): GeneBox[] {
  if (genes.length === 0) {
    return genes
  }
  const min = Math.min(...genes.map(g => g.x))
  const max = Math.max(...genes.map(g => g.x + g.width))
  return genes.map(
    (g): GeneBox => ({
      ...g,
      x: min + max - (g.x + g.width),
      drawStrand: g.drawStrand > 0 ? -1 : 1,
    }),
  )
}

// Cladogram (rectangular): rows are the vertical axis (a leaf sits at its row y),
// topological depth is the horizontal axis. Every node is positioned at
// `rootHeight - height` — where a node's height is its longest link chain down to
// a leaf — which right-aligns all leaf tips at treeWidth regardless of tree
// balance, instead of leaving shallow leaves dangling mid-panel. This is the
// ape::plot.phylo / JBrowse tree-sidebar convention (packages/tree-sidebar
// assignDepthY). Each horizontal edge runs to its child's own depth, so an
// unbalanced clade still connects correctly. Returns edges to draw plus internal
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
  const height = new Map<TaxonNode, number>()
  function heightOf(node: TaxonNode): number {
    const h =
      node.children.length === 0
        ? 0
        : 1 + Math.max(...node.children.map(heightOf))
    height.set(node, h)
    return h
  }
  const rootHeight = heightOf(tree)
  const xAt = (h: number) =>
    rootHeight === 0 ? treeWidth : ((rootHeight - h) / rootHeight) * treeWidth

  interface Placed {
    x: number
    y: number
    leaves: number[]
  }
  function place(node: TaxonNode): Placed | undefined {
    if (node.children.length === 0) {
      const y = rowY.get(node.taxonId)
      return y === undefined
        ? undefined
        : { x: treeWidth, y, leaves: [node.taxonId] }
    }
    const kids = node.children
      .map(place)
      .filter((r): r is Placed => r !== undefined)
    if (kids.length === 0) {
      return undefined
    }
    const x = xAt(height.get(node) ?? 0)
    for (const kid of kids) {
      edges.push({ x1: x, y1: kid.y, x2: kid.x, y2: kid.y }) // horizontal to child
    }
    edges.push({ x1: x, y1: kids[0]!.y, x2: x, y2: kids.at(-1)!.y }) // vertical spine
    const y = kids.reduce((s, k) => s + k.y, 0) / kids.length
    const leaves = kids.flatMap(k => k.leaves)
    nodes.push({ x, y, leafTaxonIds: leaves })
    return { x, y, leaves }
  }
  place(tree)
  return { edges, nodes }
}

// gggenes-style arrow path: rectangular body with a triangular head on the
// strand end, collapsing to a triangle when the gene is narrower than the head.
// Coordinates are local to the row (translate the group to the row's y).
export function geneArrowPath(g: GeneBox, h: number) {
  const head = Math.min(h, g.width)
  const x = g.x
  const r = g.x + g.width
  return g.drawStrand > 0
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

  // Rows whose gene order runs opposite the reference's get mirrored so a
  // whole-locus inversion reads as a flipped block (the reference row itself never
  // flips, since it defines the order). Reference order = anchors by genomic
  // position; the query gene's reference strand is only a fallback tiebreaker.
  const refRank = new Map(
    [...nb.anchors]
      .sort((a, b) => a.refStart - b.refStart)
      .map((a, i) => [a.geneId, i] as const),
  )
  const refRow = nb.species.find(s => s.taxonId === nb.query.refTaxonId)
  const canonicalStrand =
    refRow?.genes.find(g => g.anchorId === nb.query.geneId)?.strand ?? 1

  const rows: RowLayout[] = nb.species.map((s, i) => {
    const y = i * opt.rowHeight
    const ref = dominantRefName(s.genes, nb.query.geneId) ?? ''
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
    const queryGene = onScaffold.find(g => g.anchorId === nb.query.geneId)
    const inverted =
      opt.orientToRef &&
      isInverted(onScaffold, refRank, nb.query.geneId, canonicalStrand)
    return {
      taxonId: s.taxonId,
      label: s.commonName ?? s.scientificName ?? String(s.taxonId),
      y: y + centerOffset,
      genes: inverted ? mirrorRow(placed) : placed,
      translocated: s.genes.length - onScaffold.length,
      inverted,
      hasQuery: queryGene !== undefined,
      assembly: onScaffold[0]?.assembly ?? '',
      refName: ref,
      spanStart: onScaffold.length
        ? Math.min(...onScaffold.map(g => g.start))
        : 0,
      spanEnd: onScaffold.length ? Math.max(...onScaffold.map(g => g.end)) : 0,
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
    geneHeight: opt.geneHeight,
  }
}
