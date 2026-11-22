// Pure geometry for MultiSyntenyView: tree-ordered rows of gene arrows, ribbons
// between adjacent rows and a cladogram, as SVG-ready coordinates.

import type { TaxonNode } from './multiSyntenyTaxonTree.ts'
import type { Anchor, Neighborhood, PlacedGene } from './neighborhood.ts'

export type LayoutMode = 'bp' | 'ordinal'

interface LayoutOptions {
  mode: LayoutMode
  treeWidth: number
  labelWidth: number
  trackWidth: number
  // room right of the track for each row's span, e.g. "254 kb"
  spanWidth: number
  rowHeight: number
  geneHeight: number
  // room above the first row for the column headers
  headerHeight: number
  // Mirror each row whose query ortholog sits on the opposite strand from the
  // reference
  orientToRef: boolean
}

const DEFAULT_LAYOUT: LayoutOptions = {
  mode: 'bp',
  treeWidth: 140,
  labelWidth: 150,
  trackWidth: 620,
  spanWidth: 56,
  rowHeight: 22,
  geneHeight: 12,
  headerHeight: 0,
  orientToRef: true,
}

export interface GeneBox extends PlacedGene {
  x: number
  width: number
  // Drawn arrow direction: the genomic strand, negated in a mirrored row.
  // `strand` stays genomic for tooltips.
  drawStrand: 1 | -1
  // Drawn evenly spaced outside its reference gene's column, so its column
  // header names another gene
  displaced: boolean
}

export interface RowLayout {
  taxonId: number
  label: string
  y: number // top of the row's gene track band
  genes: GeneBox[]
  // Genes the row does not draw in its run, as boxes in their reference
  // columns where the column is free: on another scaffold, or too far along
  // this one. Evenly spaced rows only.
  elsewhere: GeneBox[]
  // Draws two genes or more, all in the reference's order
  keepsOrder: boolean
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
interface Ribbon {
  anchorId: string
  color: string
  topY: number
  bottomY: number
  topLeft: number
  topRight: number
  bottomLeft: number
  bottomRight: number
}

interface TreeEdge {
  x1: number
  y1: number
  x2: number
  y2: number
}

// A reference gene's column in the evenly spaced layout
interface Column {
  anchorId: string
  center: number
}

interface MultiSyntenyLayout {
  rows: RowLayout[]
  columns: Column[]
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
  const queryFirst = [
    ...anchors.filter(a => a.isQuery),
    ...anchors.filter(a => !a.isQuery),
  ]
  return new Map(
    queryFirst.map((a, i) => [a.geneId, PALETTE[i % PALETTE.length]!]),
  )
}

// The scaffold a row is laid out on: the query gene's scaffold if present, else
// the one carrying the most anchors. Genes elsewhere are counted as
// translocated.
export function dominantRefName(genes: PlacedGene[], queryAnchorId: string) {
  const query = genes.find(g => g.anchorId === queryAnchorId)
  if (query) {
    return query.refName
  }
  const counts = new Map<string, number>()
  for (const g of genes) {
    counts.set(g.refName, (counts.get(g.refName) ?? 0) + 1)
  }
  return [...counts].toSorted((a, b) => b[1] - a[1])[0]?.[0]
}

// A gap no neighborhood is expected to have, whatever the row's spacing, and
// one every row may have before it counts as a break.
const NEAR_BP = 1_000_000
const FAR_BP = 10_000_000

function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

// The run of genes a row draws: its scaffold cut wherever the gap to the next
// gene is far past the row's own spacing, keeping the run that holds the query
// gene (else the longest). A row spread evenly over tens of Mb stays whole, and
// so does a short row: cutting rows of three genes or fewer at NEAR_BP was
// tried on 2026-11-21 and dropped real neighbours 1 to 4.5 Mb apart in lamprey
// and shark genomes.
export function localCluster(genes: PlacedGene[], queryAnchorId: string) {
  const sorted = genes.toSorted((a, b) => a.start - b.start)
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

// The genes a row draws: its local run on the scaffold it is laid out on.
export function drawnRun(genes: PlacedGene[], queryAnchorId: string) {
  const ref = dominantRefName(genes, queryAnchorId)
  return localCluster(
    genes.filter(g => g.refName === ref),
    queryAnchorId,
  )
}

// Whether one gene's span holds the other's, as OMG, EVI2A and EVI2B sit in an
// intron of NF1. Neither start nor end order of such a pair says which way a
// row runs: in a mirrored row NF1 still starts first.
function nested(a: { start: number; end: number }, b: typeof a) {
  return (
    (a.start <= b.start && a.end >= b.end) ||
    (b.start <= a.start && b.end >= a.end)
  )
}

// The anchors in the order the reference row draws them, with an anchor it
// does not draw at NCBI's position. The legend, the row order of every other
// row and the query's column all take this one order: NCBI's full span put
// SHBG before SAT2 in TP53's legend while the row, drawn over coding exons,
// had SAT2 first.
export function referenceOrder(nb: Neighborhood) {
  const refRow = nb.species.find(s => s.taxonId === nb.query.refTaxonId)
  const drawn = new Map(
    drawnRun(refRow?.genes ?? [], nb.query.geneId).map(g => [g.anchorId, g]),
  )
  return nb.anchors.toSorted(
    (a, b) =>
      (drawn.get(a.geneId)?.start ?? a.refStart) -
      (drawn.get(b.geneId)?.start ?? b.refStart),
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
  const ends = (g: PlacedGene): [number, number] => {
    const a = pos(g.start)
    const b = pos(g.end)
    return a <= b ? [a, b] : [b, a]
  }
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
    const width = Math.max(3, (to - from) * scale)
    return {
      ...g,
      displaced: false,
      x: Math.min(
        trackLeft + (from - start) * scale,
        trackLeft + trackWidth - width,
      ),
      width,
      drawStrand: reversed ? (g.strand > 0 ? -1 : 1) : g.strand,
    }
  })
}

// The reference row's frame, from the same local run its own row draws.
function referenceFrame(nb: Neighborhood): BpFrame {
  const queryAnchorId = nb.query.geneId
  const refRow = nb.species.find(s => s.taxonId === nb.query.refTaxonId)
  const run = drawnRun(refRow?.genes ?? [], queryAnchorId)
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

// A row's genes in drawing order: by start, or by end from the far side in a
// mirrored row, which is the true mirror of by start. A nested pair keeps the
// reference's order, since neither end of it says which way the row runs;
// sorting a mirrored row by start, descending, swapped HOXA3 with the HOXA4,
// A5 and A6 it spans and drew 150 of HOXA9's 888 species out of order.
export function drawingOrder(
  genes: PlacedGene[],
  refRank: Map<string, number>,
  reversed: boolean,
) {
  const ordered = genes.toSorted((a, b) =>
    reversed ? b.end - a.end : a.start - b.start,
  )
  for (let pass = 0; pass < ordered.length; pass++) {
    for (let i = 0; i + 1 < ordered.length; i++) {
      const a = ordered[i]!
      const b = ordered[i + 1]!
      const ra = refRank.get(a.anchorId) ?? -1
      const rb = refRank.get(b.anchorId) ?? -1
      if (ra > rb && rb >= 0 && nested(a, b)) {
        ordered[i] = b
        ordered[i + 1] = a
      }
    }
  }
  return ordered
}

// How much more a query gene's distance from its column counts than another
// gene's, so query orthologs share one column whatever else the row lacks
const QUERY_WEIGHT = 100

// Columns for genes in drawing order: rising left to right, each as near its
// wanted column as the order allows, by least total distance. Packing each row
// from the left drew one missing ortholog as every later gene moving a column
// over. A row with more genes than columns, which one gene per anchor rules
// out, keeps its order from the left.
export function referenceColumns(
  wants: number[],
  weights: number[],
  slots: number,
) {
  const m = wants.length
  const cost: number[][] = []
  const from: number[][] = []
  wants.forEach((want, i) => {
    const prev = cost[i - 1]
    const row: number[] = []
    const back: number[] = []
    let best = prev ? Number.POSITIVE_INFINITY : 0
    let bestAt = -1
    for (let slot = 0; slot < slots; slot++) {
      const before = prev?.[slot - 1] ?? Number.POSITIVE_INFINITY
      if (before < best) {
        best = before
        bestAt = slot - 1
      }
      row.push(
        slot >= i && slot <= slots - (m - i)
          ? best + (weights[i] ?? 1) * Math.abs(slot - want)
          : Number.POSITIVE_INFINITY,
      )
      back.push(bestAt)
    }
    cost.push(row)
    from.push(back)
  })
  const last = cost.at(-1) ?? []
  const chosen: number[] = []
  let slot = last.indexOf(Math.min(...last))
  for (let i = m - 1; i >= 0; i--) {
    chosen[i] = slot
    slot = from[i]?.[slot] ?? -1
  }
  return m > slots ? wants.map((_, i) => i) : chosen
}

// Equal slots, one per reference gene, each gene in its reference gene's
// column where the row's order allows (back-to-front for an inverted row).
function placeOrdinal(
  genes: PlacedGene[],
  trackLeft: number,
  trackWidth: number,
  slots: number,
  queryAnchorId: string,
  refRank: Map<string, number>,
  reversed: boolean,
) {
  const slotW = trackWidth / Math.max(1, slots)
  const ordered = drawingOrder(genes, refRank, reversed)
  const columns = referenceColumns(
    ordered.map((g, i) => refRank.get(g.anchorId) ?? i),
    ordered.map(g => (g.anchorId === queryAnchorId ? QUERY_WEIGHT : 1)),
    slots,
  )
  return ordered.map((g, i): GeneBox => {
    const column = columns[i] ?? i
    return {
      ...g,
      x: trackLeft + column * slotW + slotW * 0.1,
      width: slotW * 0.8,
      drawStrand: reversed ? (g.strand > 0 ? -1 : 1) : g.strand,
      displaced: column !== refRank.get(g.anchorId),
    }
  })
}

// The genes a row leaves out of its run, each boxed in its reference column
// when no drawn gene sits there
function placeElsewhere(
  hidden: PlacedGene[],
  drawn: GeneBox[],
  trackLeft: number,
  slotW: number,
  refRank: Map<string, number>,
) {
  const taken = new Set(
    drawn.map(g => Math.round((g.x - trackLeft - slotW * 0.1) / slotW)),
  )
  return hidden.flatMap((g): GeneBox[] => {
    const column = refRank.get(g.anchorId)
    return column === undefined || taken.has(column)
      ? []
      : [
          {
            ...g,
            x: trackLeft + column * slotW + slotW * 0.1,
            width: slotW * 0.8,
            drawStrand: g.strand,
            displaced: false,
          },
        ]
  })
}

// A row is inverted relative to the reference by the sign of its gene-order
// correlation over the shared anchors (Kendall's tau sign), not one gene's
// strand: orthologs routinely differ in strand without the locus being
// inverted. A nested pair has no vote: it read "same order" both ways round,
// which left cattle and elephant unmirrored in NF1's figure though their order
// mirrors baboon's exactly. With no votes or a tie, falls back to the query
// gene's strand.
function isInverted(
  genes: PlacedGene[],
  refRank: Map<string, number>,
  queryAnchorId: string,
  canonicalStrand: 1 | -1,
): boolean {
  const ranked = genes
    .flatMap(g => {
      const rank = refRank.get(g.anchorId)
      return rank === undefined ? [] : [{ start: g.start, end: g.end, rank }]
    })
    .toSorted((a, b) => a.start - b.start)
  let concordant = 0
  let discordant = 0
  for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const earlier = ranked[i]!
      const later = ranked[j]!
      if (!nested(earlier, later)) {
        if (later.rank > earlier.rank) {
          concordant++
        } else if (later.rank < earlier.rank) {
          discordant++
        }
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
  // reference row never flips. The query gene's strand is only a tiebreaker.
  const refRank = new Map(
    referenceOrder(nb).map((a, i) => [a.geneId, i] as const),
  )
  const refRow = nb.species.find(s => s.taxonId === nb.query.refTaxonId)
  const slotW = opt.trackWidth / Math.max(1, nb.anchors.length)
  const frame = referenceFrame(nb)
  const canonicalStrand =
    refRow?.genes.find(g => g.anchorId === nb.query.geneId)?.strand ?? 1

  const rows: RowLayout[] = nb.species.map((s, i) => {
    const y = opt.headerHeight + i * opt.rowHeight
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
              nb.query.geneId,
              refRank,
              inverted,
            )
    const inRun = new Set(onScaffold)
    const ranks = drawingOrder(onScaffold, refRank, inverted).map(
      g => refRank.get(g.anchorId) ?? -1,
    )
    return {
      taxonId: s.taxonId,
      label: s.commonName ?? s.scientificName ?? String(s.taxonId),
      y: y + centerOffset,
      genes: placed,
      elsewhere:
        opt.mode === 'ordinal'
          ? placeElsewhere(
              s.genes.filter(g => !inRun.has(g)),
              placed,
              trackLeft,
              slotW,
              refRank,
            )
          : [],
      keepsOrder:
        ranks.length >= 2 &&
        ranks.every((r, k) => k === 0 || r > ranks[k - 1]!),
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
    columns: referenceOrder(nb).map((a, i) => ({
      anchorId: a.geneId,
      center: trackLeft + (i + 0.5) * slotW,
    })),
    ribbons,
    treeEdges,
    anchorColors,
    trackLeft,
    trackRight: trackLeft + opt.trackWidth,
    width: trackLeft + opt.trackWidth + opt.spanWidth,
    height: opt.headerHeight + rows.length * opt.rowHeight,
    geneHeight: opt.geneHeight,
  }
}
