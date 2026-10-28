// Pure geometry for MultiSyntenyView: tree-ordered rows of gene arrows, ribbons
// between adjacent rows and a cladogram, as SVG-ready coordinates.

import type { TaxonNode } from './multiSyntenyTaxonTree.ts'
import type { Anchor, Neighborhood, PlacedGene } from './neighborhood.ts'

export type LayoutMode = 'bp' | 'ordinal'

export interface LayoutOptions {
  mode: LayoutMode
  treeWidth: number
  labelWidth: number
  trackWidth: number
  // room right of the track for each row's span, e.g. "254 kb"
  spanWidth: number
  rowHeight: number
  geneHeight: number
  // Mirror each row whose query ortholog sits on the opposite strand from the
  // reference
  orientToRef: boolean
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  mode: 'bp',
  treeWidth: 140,
  labelWidth: 150,
  trackWidth: 620,
  spanWidth: 56,
  rowHeight: 22,
  geneHeight: 12,
  orientToRef: true,
}

export interface GeneBox extends PlacedGene {
  x: number
  width: number
  // Drawn arrow direction: the genomic strand, negated in a mirrored row.
  // `strand` stays genomic for tooltips.
  drawStrand: 1 | -1
}

export interface RowLayout {
  taxonId: number
  label: string
  y: number // top of the row's gene track band
  genes: GeneBox[]
  translocated: number // anchors on a different scaffold (not drawn in-track)
  // anchors on the row's scaffold but too far from its cluster to draw as
  // neighbors (see localCluster)
  distant: number
  inverted: boolean // row mirrored to match the reference's query orientation
  isRef: boolean
  hasQuery: boolean // the query anchor's ortholog is present on this scaffold
  assembly: string // GCF accession of this row's genes (for JBrowse launch)
  refName: string // dominant scaffold the row is laid out on
  spanStart: number // genomic bounds of the drawn genes on that scaffold
  spanEnd: number
}

// A filled band from an anchor's gene in the top row to its gene in the row
// below; crossing bands mean a rearrangement.
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

export interface MultiSyntenyLayout {
  rows: RowLayout[]
  ribbons: Ribbon[]
  treeEdges: TreeEdge[]
  anchorColors: Map<string, string>
  trackLeft: number
  trackRight: number
  width: number
  height: number
  geneHeight: number
}

// Stable hue per anchor, query first; unique up to the largest offered anchor
// count (21).
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
// the one carrying the most anchors. Genes elsewhere are counted as
// translocated.
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

// A gap no neighborhood is expected to have, whatever the row's spacing, and
// one every row may have before it counts as a break.
const NEAR_BP = 1_000_000
const FAR_BP = 10_000_000

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

// The run of genes a row draws: its scaffold cut wherever the gap to the next
// gene is far past the row's own spacing, keeping the run that holds the query
// gene (else the longest). A row spread evenly over tens of Mb stays whole.
export function localCluster(genes: PlacedGene[], queryAnchorId: string) {
  const sorted = [...genes].sort((a, b) => a.start - b.start)
  const gaps = sorted.slice(1).map((g, i) => g.start - sorted[i]!.end)
  const limit = Math.min(FAR_BP, Math.max(NEAR_BP, 10 * median(gaps)))
  const runs: PlacedGene[][] = []
  sorted.forEach((g, i) => {
    const gap = gaps[i - 1]
    const run = runs.at(-1)
    if (run && gap !== undefined && gap <= limit) {
      run.push(g)
    } else {
      runs.push([g])
    }
  })
  return (
    runs.find(run => run.some(g => g.anchorId === queryAnchorId)) ??
    runs.reduce<PlacedGene[]>((a, b) => (b.length > a.length ? b : a), [])
  )
}

// 254 kb, 3.1 Mb
export function formatSpan(bp: number) {
  return bp < 1_000_000
    ? `${Math.max(1, Math.round(bp / 1000))} kb`
    : `${(bp / 1_000_000).toFixed(1)} Mb`
}

// Where the reference draws the query gene: its local run's span, and how far
// along that span the query sits, 0 to 1.
interface BpFrame {
  span: number
  queryFrac: number
  queryAnchorId: string
}

// Genes at their positions, in the row's own orientation. A row wider than the
// reference scales to fit the track; a narrower one keeps the reference's scale
// with its query ortholog under the reference's query gene, never stretched.
function placeBp(
  genes: PlacedGene[],
  trackLeft: number,
  trackWidth: number,
  frame: BpFrame,
  reversed: boolean,
) {
  const pos = (bp: number) => (reversed ? -bp : bp)
  const ends = (g: PlacedGene) =>
    [pos(g.start), pos(g.end)].sort((p, q) => p - q) as [number, number]
  const lo = Math.min(...genes.map(g => ends(g)[0]))
  const hi = Math.max(...genes.map(g => ends(g)[1]))
  const span = Math.max(1, hi - lo, frame.span)
  const query = genes.find(g => g.anchorId === frame.queryAnchorId)
  const queryMid = query ? (ends(query)[0] + ends(query)[1]) / 2 : (lo + hi) / 2
  const start = Math.min(
    Math.max(queryMid - frame.queryFrac * span, hi - span),
    lo,
  )
  const scale = trackWidth / span
  return genes.map((g): GeneBox => {
    const [from, to] = ends(g)
    return {
      ...g,
      x: trackLeft + (from - start) * scale,
      width: Math.max(3, (to - from) * scale),
      drawStrand: reversed ? (g.strand > 0 ? -1 : 1) : g.strand,
    }
  })
}

// The reference row's frame, from the same local run its own row draws.
function referenceFrame(nb: Neighborhood): BpFrame {
  const queryAnchorId = nb.query.geneId
  const refRow = nb.species.find(s => s.taxonId === nb.query.refTaxonId)
  const ref = refRow && dominantRefName(refRow.genes, queryAnchorId)
  const run = refRow
    ? localCluster(
        refRow.genes.filter(g => g.refName === ref),
        queryAnchorId,
      )
    : []
  const query = run.find(g => g.anchorId === queryAnchorId)
  if (run.length === 0 || !query) {
    return { span: 0, queryFrac: 0.5, queryAnchorId }
  }
  const lo = Math.min(...run.map(g => g.start))
  const span = Math.max(1, Math.max(...run.map(g => g.end)) - lo)
  return {
    span,
    queryFrac: ((query.start + query.end) / 2 - lo) / span,
    queryAnchorId,
  }
}

// Equal slots in order (back-to-front for an inverted row) with the query gene
// in the reference's slot, so query orthologs share a column. A row with its
// genes mostly on one side of the query shifts only as far as the track needs;
// without a query it starts at the left.
function placeOrdinal(
  genes: PlacedGene[],
  trackLeft: number,
  trackWidth: number,
  slots: number,
  query: { anchorId: string; slot: number },
  reversed: boolean,
) {
  const slotW = trackWidth / Math.max(1, slots)
  const ordered = [...genes].sort((a, b) =>
    reversed ? b.start - a.start : a.start - b.start,
  )
  const qi = ordered.findIndex(g => g.anchorId === query.anchorId)
  const offset = Math.min(
    Math.max(0, qi >= 0 ? query.slot - qi : 0),
    Math.max(0, slots - ordered.length),
  )
  return ordered.map((g, i): GeneBox => ({
    ...g,
    x: trackLeft + (offset + i) * slotW + slotW * 0.1,
    width: slotW * 0.8,
    drawStrand: reversed ? (g.strand > 0 ? -1 : 1) : g.strand,
  }))
}

// A row is inverted relative to the reference by the sign of its gene-order
// correlation over the shared anchors (Kendall's tau sign), not one gene's
// strand: orthologs routinely differ in strand without the locus being
// inverted. With 0 or 1 shared anchor or a tie, falls back to the query gene's
// strand.
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

// The tree as drawn: a branch point left with one drawn child is replaced by
// that child, since keeping it draws a second spine over the same clade.
function drawnTree(
  node: TaxonNode,
  rowY: Map<number, number>,
): TaxonNode | undefined {
  if (node.children.length === 0) {
    return rowY.has(node.taxonId) ? node : undefined
  }
  const children = node.children
    .map(c => drawnTree(c, rowY))
    .filter((c): c is TaxonNode => c !== undefined)
  return children.length > 1 ? { ...node, children } : children[0]
}

// Rectangular cladogram: a leaf sits at its row y, and a node at `rootHeight -
// height` (height = longest chain down to a leaf), which right-aligns every
// leaf tip at treeWidth. Each horizontal edge runs to its child's own depth.
function layoutTree(
  tree: TaxonNode | undefined,
  rowY: Map<number, number>,
  treeWidth: number,
) {
  const edges: TreeEdge[] = []
  const drawn = tree && drawnTree(tree, rowY)
  if (!drawn) {
    return edges
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
  const rootHeight = heightOf(drawn)
  const xAt = (h: number) =>
    rootHeight === 0 ? treeWidth : ((rootHeight - h) / rootHeight) * treeWidth

  function place(node: TaxonNode): { x: number; y: number } {
    if (node.children.length === 0) {
      return { x: treeWidth, y: rowY.get(node.taxonId) ?? 0 }
    }
    const kids = node.children.map(place)
    const x = xAt(height.get(node) ?? 0)
    for (const kid of kids) {
      edges.push({ x1: x, y1: kid.y, x2: kid.x, y2: kid.y })
    }
    edges.push({ x1: x, y1: kids[0]!.y, x2: x, y2: kids.at(-1)!.y })
    return { x, y: kids.reduce((s, k) => s + k.y, 0) / kids.length }
  }
  place(drawn)
  return edges
}

// gggenes-style arrow path, local to the row; a triangle when the gene is
// narrower than the head.
export function geneArrowPath(g: GeneBox, h: number) {
  const head = Math.min(h, g.width)
  const x = g.x
  const r = g.x + g.width
  return g.drawStrand > 0
    ? `M${x},0 L${r - head},0 L${r},${h / 2} L${r - head},${h} L${x},${h} Z`
    : `M${r},0 L${x + head},0 L${x},${h / 2} L${x + head},${h} L${r},${h} Z`
}

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

  // Rows whose gene order runs opposite the reference's get mirrored; the
  // reference row never flips. Reference order = anchors by genomic position;
  // the query gene's strand is only a tiebreaker.
  const refRank = new Map(
    [...nb.anchors]
      .sort((a, b) => a.refStart - b.refStart)
      .map((a, i) => [a.geneId, i] as const),
  )
  const refRow = nb.species.find(s => s.taxonId === nb.query.refTaxonId)
  const querySlot = refRank.get(nb.query.geneId) ?? 0
  const frame = referenceFrame(nb)
  const canonicalStrand =
    refRow?.genes.find(g => g.anchorId === nb.query.geneId)?.strand ?? 1

  const rows: RowLayout[] = nb.species.map((s, i) => {
    const y = i * opt.rowHeight
    const ref = dominantRefName(s.genes, nb.query.geneId) ?? ''
    const sameScaffold = s.genes.filter(g => g.refName === ref)
    const onScaffold = localCluster(sameScaffold, nb.query.geneId)
    const queryGene = onScaffold.find(g => g.anchorId === nb.query.geneId)
    const inverted =
      opt.orientToRef &&
      isInverted(onScaffold, refRank, nb.query.geneId, canonicalStrand)
    const placed =
      onScaffold.length === 0
        ? []
        : opt.mode === 'bp'
          ? placeBp(onScaffold, trackLeft, opt.trackWidth, frame, inverted)
          : placeOrdinal(
              onScaffold,
              trackLeft,
              opt.trackWidth,
              nb.anchors.length,
              { anchorId: nb.query.geneId, slot: querySlot },
              inverted,
            )
    return {
      taxonId: s.taxonId,
      label: s.commonName ?? s.scientificName ?? String(s.taxonId),
      y: y + centerOffset,
      genes: placed,
      translocated: s.genes.length - sameScaffold.length,
      distant: sameScaffold.length - onScaffold.length,
      inverted,
      isRef: s.taxonId === nb.query.refTaxonId,
      hasQuery: queryGene !== undefined,
      assembly: onScaffold[0]?.assembly ?? '',
      refName: ref,
      spanStart: onScaffold.length
        ? Math.min(...onScaffold.map(g => g.start))
        : 0,
      spanEnd: onScaffold.length ? Math.max(...onScaffold.map(g => g.end)) : 0,
    }
  })

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
  const treeEdges = layoutTree(nb.tree, rowY, opt.treeWidth)

  return {
    rows,
    ribbons,
    treeEdges,
    anchorColors,
    trackLeft,
    trackRight: trackLeft + opt.trackWidth,
    width: trackLeft + opt.trackWidth + opt.spanWidth,
    height: rows.length * opt.rowHeight,
    geneHeight: opt.geneHeight,
  }
}
