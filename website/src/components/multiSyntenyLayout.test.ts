import assert from 'node:assert'
import { test } from 'node:test'

import {
  formatSpan,
  geneArrowPath,
  layoutNeighborhood,
  localCluster,
} from './multiSyntenyLayout.ts'

import type { GeneBox } from './multiSyntenyLayout.ts'
import type { TaxonNode } from './multiSyntenyTaxonTree.ts'
import type { Neighborhood, PlacedGene } from './neighborhood.ts'

const DEFAULT_TREE_WIDTH = 140

function gene(
  anchorId: string,
  start: number,
  over: Partial<PlacedGene> = {},
): PlacedGene {
  return {
    anchorId,
    symbol: anchorId,
    assembly: 'GCF_TEST',
    refName: 'chr1',
    chromosome: '1',
    start,
    end: start + 100,
    strand: 1,
    ...over,
  }
}

const nb: Neighborhood = {
  query: { geneId: 'A', symbol: 'A', refTaxonId: 9606 },
  anchors: [
    { geneId: 'A', symbol: 'A', isQuery: true, refStart: 0, refEnd: 100 },
    { geneId: 'B', symbol: 'B', isQuery: false, refStart: 200, refEnd: 300 },
  ],
  species: [
    {
      taxonId: 9606,
      commonName: 'human',
      genes: [gene('A', 0), gene('B', 200)],
    },
    // mouse has the same two anchors but B sits before A: a rearrangement.
    {
      taxonId: 10090,
      commonName: 'mouse',
      genes: [gene('A', 200), gene('B', 0)],
    },
  ],
}

test('layout produces one row per species in input order', () => {
  const l = layoutNeighborhood(nb)
  assert.equal(l.rows.length, 2)
  assert.equal(l.rows[0]?.label, 'human')
  assert.equal(l.rows[1]?.label, 'mouse')
})

test('the query anchor color is the first palette hue', () => {
  const l = layoutNeighborhood(nb)
  assert.equal(l.anchorColors.get('A'), '#d62728')
  assert.notEqual(l.anchorColors.get('B'), l.anchorColors.get('A'))
})

test('ribbons link the same anchor across adjacent rows', () => {
  const l = layoutNeighborhood(nb)
  assert.equal(l.ribbons.length, 2)
  assert.deepEqual(new Set(l.ribbons.map(r => r.anchorId)), new Set(['A', 'B']))
})

test('a reversed row crosses when not oriented to the reference', () => {
  // orientToRef off: mouse keeps its genomic order (B then A), so the shared
  // anchors' ribbons cross — A is left on top but right on the bottom.
  const l = layoutNeighborhood(nb, { orientToRef: false })
  const a = l.ribbons.find(r => r.anchorId === 'A')!
  const b = l.ribbons.find(r => r.anchorId === 'B')!
  assert.ok(a.topLeft < b.topLeft)
  assert.ok(a.bottomLeft > b.bottomLeft)
})

test('a two-gene order reversal is treated as an inversion and mirrored', () => {
  // With orient-to-reference on (default), the smallest possible inversion — a
  // reversed pair — is flipped back so the ribbons run straight, not crossed.
  const l = layoutNeighborhood(nb)
  assert.equal(l.rows[1]?.inverted, true)
  const a = l.ribbons.find(r => r.anchorId === 'A')!
  const b = l.ribbons.find(r => r.anchorId === 'B')!
  assert.ok(a.topLeft < b.topLeft)
  assert.ok(a.bottomLeft < b.bottomLeft)
})

test('genes off the dominant scaffold are counted as translocated, not placed', () => {
  const translocated: Neighborhood = {
    ...nb,
    species: [
      {
        taxonId: 9606,
        commonName: 'human',
        genes: [gene('A', 0), gene('B', 50, { refName: 'chr2' })],
      },
    ],
  }
  const l = layoutNeighborhood(translocated)
  assert.equal(l.rows[0]?.genes.length, 1)
  assert.equal(l.rows[0]?.translocated, 1)
})

test('a gene far along the same scaffold is distant, not drawn', () => {
  const genes = [
    gene('A', 0),
    gene('B', 30_000),
    gene('C', 60_000),
    gene('D', 848_000_000),
  ]
  assert.deepEqual(
    localCluster(genes, 'A').map(g => g.anchorId),
    ['A', 'B', 'C'],
  )
  const far: Neighborhood = {
    ...nb,
    species: [{ taxonId: 9606, commonName: 'human', genes }],
  }
  const row = layoutNeighborhood(far).rows[0]!
  assert.equal(row.genes.length, 3)
  assert.equal(row.distant, 1)
  assert.equal(row.translocated, 0)
  assert.equal(row.spanEnd, 60_100)
})

// A row narrower than the reference keeps the reference's scale, its query
// ortholog under the reference's, instead of being stretched edge to edge.
test('a narrow row is drawn at the reference scale under its query gene', () => {
  const narrow: Neighborhood = {
    ...nb,
    species: [
      {
        taxonId: 9606,
        commonName: 'human',
        genes: [gene('A', 0), gene('B', 9_900)],
      },
      { taxonId: 7955, commonName: 'zebrafish', genes: [gene('A', 500)] },
    ],
  }
  const l = layoutNeighborhood(narrow)
  const human = l.rows[0]!.genes.find(g => g.anchorId === 'A')!
  const fish = l.rows[1]!.genes[0]!
  assert.ok(fish.width < 10)
  assert.ok(Math.abs(fish.x - human.x) < 0.001)
})

test('a row spread evenly over tens of Mb stays whole', () => {
  const genes = [0, 1, 2, 3, 4].map(i => gene(String(i), i * 6_000_000))
  assert.equal(localCluster(genes, '0').length, 5)
})

test('without the query gene the longest run is kept', () => {
  const genes = [gene('A', 0), gene('B', 50_000_000), gene('C', 50_020_000)]
  assert.deepEqual(
    localCluster(genes, 'Q').map(g => g.anchorId),
    ['B', 'C'],
  )
})

test('the reference row is marked', () => {
  const l = layoutNeighborhood(nb)
  assert.deepEqual(
    l.rows.map(r => r.isRef),
    [true, false],
  )
})

test('formatSpan reads in kb under a megabase', () => {
  assert.equal(formatSpan(254_104), '254 kb')
  assert.equal(formatSpan(300), '1 kb')
  assert.equal(formatSpan(3_140_000), '3.1 Mb')
})

test('ordinal mode lays genes in equal slots sorted by position', () => {
  // orientToRef off so the row keeps its genomic order for the slot check.
  const l = layoutNeighborhood(nb, { mode: 'ordinal', orientToRef: false })
  const mouse = l.rows[1]!
  const sorted = [...mouse.genes].sort((g1, g2) => g1.x - g2.x)
  // mouse: B at 0, A at 200 -> B is the leftmost slot.
  assert.equal(sorted[0]?.anchorId, 'B')
  assert.equal(sorted[1]?.anchorId, 'A')
})

test('geneArrowPath points right for + drawStrand and left for -', () => {
  const g: GeneBox = { ...gene('A', 0), x: 10, width: 40, drawStrand: 1 }
  assert.ok(geneArrowPath(g, 12).startsWith('M10,0'))
  assert.ok(geneArrowPath({ ...g, drawStrand: -1 }, 12).startsWith('M50,0'))
})

// A genuine inversion reverses gene ORDER: reference is A(0),B(200); the inverted
// row has B before A. Order — not a single gene's strand — drives the mirror.
const inverted: Neighborhood = {
  query: { geneId: 'A', symbol: 'A', refTaxonId: 9606 },
  anchors: [
    { geneId: 'A', symbol: 'A', isQuery: true, refStart: 0, refEnd: 100 },
    { geneId: 'B', symbol: 'B', isQuery: false, refStart: 200, refEnd: 300 },
  ],
  species: [
    {
      taxonId: 9606,
      commonName: 'human',
      genes: [gene('A', 0), gene('B', 200)],
    },
    {
      taxonId: 10090,
      commonName: 'mouse',
      genes: [gene('B', 0), gene('A', 200, { strand: -1 })],
    },
  ],
}

test('a row with reversed gene order is flagged inverted and mirrored', () => {
  const l = layoutNeighborhood(inverted)
  assert.equal(l.rows[0]?.inverted, false)
  assert.equal(l.rows[1]?.inverted, true)
  const mouse = l.rows[1]!
  const a = mouse.genes.find(g => g.anchorId === 'A')!
  const b = mouse.genes.find(g => g.anchorId === 'B')!
  // Genomic order is B(0) then A(200); the mirror draws A back to the left so the
  // shared anchors line up with the reference above.
  assert.ok(a.x < b.x)
  // Drawn arrow direction negates in the mirror; genomic strand is untouched.
  assert.equal(a.drawStrand, 1)
  assert.equal(a.strand, -1)
})

// The false-positive the correlation approach fixes: a lone query ortholog on the
// opposite strand while the NEIGHBOR order is preserved is not a locus inversion.
test('a flipped-strand query with preserved neighbor order is not inverted', () => {
  const notInverted: Neighborhood = {
    ...inverted,
    species: [
      inverted.species[0]!,
      {
        taxonId: 10090,
        commonName: 'mouse',
        genes: [gene('A', 0, { strand: -1 }), gene('B', 200)],
      },
    ],
  }
  const l = layoutNeighborhood(notInverted)
  assert.equal(l.rows[1]?.inverted, false)
  const mouse = l.rows[1]!
  const a = mouse.genes.find(g => g.anchorId === 'A')!
  const b = mouse.genes.find(g => g.anchorId === 'B')!
  // Order preserved, so genes stay in genomic order and strand is drawn as-is.
  assert.ok(a.x < b.x)
  assert.equal(a.drawStrand, -1)
})

// With only the query ortholog on the scaffold there is no order signal, so the
// mirror falls back to comparing that gene's strand with the reference's.
test('a single opposite-strand ortholog falls back to strand for inversion', () => {
  const lone: Neighborhood = {
    ...inverted,
    species: [
      inverted.species[0]!,
      {
        taxonId: 10090,
        commonName: 'mouse',
        genes: [gene('A', 0, { strand: -1 })],
      },
    ],
  }
  assert.equal(layoutNeighborhood(lone).rows[1]?.inverted, true)
})

test('orientToRef:false leaves an inverted locus in genomic order', () => {
  const l = layoutNeighborhood(inverted, { orientToRef: false })
  assert.equal(l.rows[1]?.inverted, false)
  const mouse = l.rows[1]!
  const a = mouse.genes.find(g => g.anchorId === 'A')!
  const b = mouse.genes.find(g => g.anchorId === 'B')!
  // Genomic order B(0) then A(200) is preserved unmirrored.
  assert.ok(b.x < a.x)
  assert.equal(a.drawStrand, -1)
})

test('layout exposes per-row span and geneHeight for launch + rendering', () => {
  const l = layoutNeighborhood(inverted)
  assert.equal(l.geneHeight, 12)
  const mouse = l.rows[1]!
  assert.equal(mouse.hasQuery, true)
  assert.equal(mouse.assembly, 'GCF_TEST')
  assert.equal(mouse.spanStart, 0)
  assert.equal(mouse.spanEnd, 300)
})

// Bacterial operons are the textbook gene-order case: a fixed cluster (here the
// trp operon, trpE-D-C-B-A) that stays contiguous across species but is often
// found inverted, and sometimes only partially retained. The reference row is the
// full operon on +; other rows exercise conservation, whole-operon inversion, and
// a partial+inverted operon — the last being what the mirror bug used to corrupt.
function operonGene(
  anchorId: string,
  start: number,
  strand: 1 | -1,
): PlacedGene {
  return {
    anchorId,
    symbol: anchorId,
    assembly: `GCF_${anchorId}`,
    refName: 'chr',
    chromosome: '1',
    start,
    end: start + 1000,
    strand,
  }
}

// Operon genes laid head-to-tail from `from`; `strand` flips every gene and, when
// negative, reverses their order so the cluster reads as a genomic inversion.
function operon(from: number, strand: 1 | -1): PlacedGene[] {
  const order =
    strand > 0 ? ['E', 'D', 'C', 'B', 'A'] : ['A', 'B', 'C', 'D', 'E']
  return order.map((id, i) => operonGene(`trp${id}`, from + i * 1200, strand))
}

const trpOperon: Neighborhood = {
  query: { geneId: 'trpA', symbol: 'trpA', refTaxonId: 562 },
  anchors: [
    {
      geneId: 'trpE',
      symbol: 'trpE',
      isQuery: false,
      refStart: 0,
      refEnd: 1000,
    },
    {
      geneId: 'trpD',
      symbol: 'trpD',
      isQuery: false,
      refStart: 1200,
      refEnd: 2200,
    },
    {
      geneId: 'trpC',
      symbol: 'trpC',
      isQuery: false,
      refStart: 2400,
      refEnd: 3400,
    },
    {
      geneId: 'trpB',
      symbol: 'trpB',
      isQuery: false,
      refStart: 3600,
      refEnd: 4600,
    },
    {
      geneId: 'trpA',
      symbol: 'trpA',
      isQuery: true,
      refStart: 4800,
      refEnd: 5800,
    },
  ],
  species: [
    // E. coli reference: whole operon on + strand (query trpA is +).
    { taxonId: 562, commonName: 'E. coli', genes: operon(0, 1) },
    // Salmonella: same order, conserved.
    { taxonId: 590, commonName: 'Salmonella', genes: operon(0, 1) },
    // Klebsiella: whole operon inverted (every gene on -), so trpA is -.
    { taxonId: 573, commonName: 'Klebsiella', genes: operon(0, -1) },
    // A reduced genome: only trpB + trpA retained, and inverted.
    {
      taxonId: 999,
      commonName: 'endosymbiont',
      genes: [operonGene('trpA', 0, -1), operonGene('trpB', 1200, -1)],
    },
  ],
}

test('conserved bacterial operon: identical order gives non-crossing ribbons', () => {
  const l = layoutNeighborhood(trpOperon, { mode: 'ordinal' })
  const ecoli = l.rows[0]!
  const salmonella = l.rows[1]!
  assert.equal(ecoli.inverted, false)
  assert.equal(salmonella.inverted, false)
  // Same gene at the same slot in both rows -> every ribbon is vertical.
  const bySlot = (r: (typeof l.rows)[number]) =>
    [...r.genes].sort((a, b) => a.x - b.x).map(g => g.anchorId)
  assert.deepEqual(bySlot(ecoli), bySlot(salmonella))
})

test('a whole-operon inversion is flagged and the arrows flip', () => {
  const l = layoutNeighborhood(trpOperon, { mode: 'ordinal' })
  const klebsiella = l.rows[2]!
  assert.equal(klebsiella.inverted, true)
  // Genomic strands are all -, but the mirrored frame draws them pointing +.
  assert.ok(klebsiella.genes.every(g => g.strand === -1))
  assert.ok(klebsiella.genes.every(g => g.drawStrand === 1))
  // Mirrored order matches the reference reading direction: trpE..trpA left->right.
  const order = [...klebsiella.genes]
    .sort((a, b) => a.x - b.x)
    .map(g => g.anchorId)
  assert.deepEqual(order, ['trpE', 'trpD', 'trpC', 'trpB', 'trpA'])
})

// A partial, inverted ordinal row lands under the reference's copies of its
// genes: its query ortholog in the reference's query slot, and its neighbor
// beside it, so both ribbons run straight down.
test('a partial inverted operon lines its query gene up with the reference', () => {
  const l = layoutNeighborhood(trpOperon, { mode: 'ordinal' })
  const full = l.rows[0]!
  const reduced = l.rows[3]!
  assert.equal(reduced.inverted, true)
  const xOf = (row: typeof full, id: string) =>
    row.genes.find(g => g.anchorId === id)!.x
  assert.ok(Math.abs(xOf(reduced, 'trpA') - xOf(full, 'trpA')) < 0.001)
  assert.ok(Math.abs(xOf(reduced, 'trpB') - xOf(full, 'trpB')) < 0.001)
  assert.ok(reduced.genes.every(g => g.drawStrand === 1))
})

test('a row with more genes past the query than slots allow shifts to fit', () => {
  const lopsided: Neighborhood = {
    query: { geneId: 'A', symbol: 'A', refTaxonId: 9606 },
    anchors: ['A', 'B', 'C'].map((geneId, i) => ({
      geneId,
      symbol: geneId,
      isQuery: geneId === 'A',
      refStart: i * 200,
      refEnd: i * 200 + 100,
    })),
    species: [
      {
        taxonId: 9606,
        genes: [gene('A', 0), gene('B', 200), gene('C', 400)],
      },
      // A last here, so aligning it to slot 0 would push B and C off the left
      {
        taxonId: 10090,
        genes: [gene('B', 0), gene('C', 200), gene('A', 400)],
      },
    ],
  }
  const l = layoutNeighborhood(lopsided, {
    mode: 'ordinal',
    orientToRef: false,
  })
  const left = Math.min(...l.rows[1]!.genes.map(g => g.x))
  assert.ok(left >= l.trackLeft)
})

// The same partial inverted row in bp mode is unaffected by the mirror change
// (its extreme genes already touch both track edges before mirroring).
test('bp mode inverts a partial operon across the full occupied track', () => {
  const l = layoutNeighborhood(trpOperon, { mode: 'bp' })
  const reduced = l.rows[3]!
  const a = reduced.genes.find(g => g.anchorId === 'trpA')!
  const b = reduced.genes.find(g => g.anchorId === 'trpB')!
  // Genomic order trpA(0) then trpB(1200); mirrored, trpB draws left of trpA.
  assert.ok(b.x < a.x)
})

// An unbalanced cladogram: a shallow outgroup leaf (opossum) sister to a deeper
// clade (human,(mouse,rat)). Every leaf tip must still reach the right edge of
// the tree band so it meets its row label, rather than dangling at half depth.
const unbalancedTree: TaxonNode = {
  taxonId: 0,
  name: 'root',
  children: [
    { taxonId: 13616, name: 'opossum', children: [] },
    {
      taxonId: 1,
      name: 'Euarchontoglires',
      children: [
        { taxonId: 9606, name: 'human', children: [] },
        {
          taxonId: 2,
          name: 'Rodentia',
          children: [
            { taxonId: 10090, name: 'mouse', children: [] },
            { taxonId: 10116, name: 'rat', children: [] },
          ],
        },
      ],
    },
  ],
}

const withTree: Neighborhood = {
  query: { geneId: 'A', symbol: 'A', refTaxonId: 9606 },
  anchors: [
    { geneId: 'A', symbol: 'A', isQuery: true, refStart: 0, refEnd: 100 },
  ],
  species: [13616, 9606, 10090, 10116].map(taxonId => ({
    taxonId,
    commonName: String(taxonId),
    genes: [gene('A', 0)],
  })),
  tree: unbalancedTree,
}

test('cladogram right-aligns every leaf tip regardless of tree depth', () => {
  const l = layoutNeighborhood(withTree)
  const leafY = (i: number) => l.rows[i]!.y + l.geneHeight / 2
  const tipEdgeAt = (y: number) =>
    l.treeEdges.find(e => e.y1 === e.y2 && Math.abs(e.y1 - y) < 1e-6)
  // The shallow outgroup (row 0) and the deepest leaves (rows 2,3) all terminate
  // at treeWidth — a ragged-tips regression would leave row 0 short.
  for (const i of [0, 2, 3]) {
    assert.equal(tipEdgeAt(leafY(i))?.x2, DEFAULT_TREE_WIDTH)
  }
  // Internal nodes sit left of the tips, deeper clades further right: the root is
  // leftmost, the rodent ancestor rightmost among internal nodes.
  const xs = l.treeNodes.map(n => n.x)
  assert.ok(Math.min(...xs) < DEFAULT_TREE_WIDTH)
  assert.ok(Math.max(...xs) < DEFAULT_TREE_WIDTH)
})

const drawing = (taxonIds: number[]): Neighborhood => ({
  ...withTree,
  species: taxonIds.map(taxonId => ({
    taxonId,
    commonName: String(taxonId),
    genes: [gene('A', 0)],
  })),
})

// Rat is not drawn, so Rodentia holds one drawn leaf: a dot there would repeat
// mouse's own row, and Euarchontoglires would be a second dot over the same
// two species as the root.
test('a branch point left with one drawn child is not drawn', () => {
  const l = layoutNeighborhood(drawing([13616, 9606, 10090]))
  assert.deepEqual(
    l.treeNodes.map(n => [...n.leafTaxonIds].sort((a, b) => a - b)),
    [
      [9606, 10090],
      [9606, 10090, 13616],
    ],
  )
})

// Without the opossum the root has one drawn child, and Euarchontoglires is the
// root of what is drawn: one dot at the left edge, and Rodentia halfway, where
// depth taken from the undrawn tree put them a third and two thirds of the way.
test('depth comes from the tree as drawn', () => {
  const l = layoutNeighborhood(drawing([9606, 10090, 10116]))
  assert.deepEqual(
    l.treeNodes.map(n => [n.leafTaxonIds.length, n.x]),
    [
      [2, DEFAULT_TREE_WIDTH / 2],
      [3, 0],
    ],
  )
})
