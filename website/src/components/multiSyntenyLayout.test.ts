import assert from 'node:assert'
import { test } from 'node:test'

import { geneArrowPath, layoutNeighborhood } from './multiSyntenyLayout.ts'

import type { GeneBox } from './multiSyntenyLayout.ts'
import type { Neighborhood, PlacedGene } from './neighborhood.ts'

function gene(anchorId: string, start: number, over: Partial<PlacedGene> = {}): PlacedGene {
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
    { taxonId: 9606, commonName: 'human', genes: [gene('A', 0), gene('B', 200)] },
    // mouse has the same two anchors but B sits before A: a rearrangement.
    { taxonId: 10090, commonName: 'mouse', genes: [gene('A', 200), gene('B', 0)] },
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

test('a rearrangement makes the two ribbons cross', () => {
  const l = layoutNeighborhood(nb)
  const a = l.ribbons.find(r => r.anchorId === 'A')!
  const b = l.ribbons.find(r => r.anchorId === 'B')!
  // A is left on top but right on the bottom; B is the mirror -> crossing.
  assert.ok(a.topLeft < b.topLeft)
  assert.ok(a.bottomLeft > b.bottomLeft)
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

test('ordinal mode lays genes in equal slots sorted by position', () => {
  const l = layoutNeighborhood(nb, { mode: 'ordinal' })
  const mouse = l.rows[1]!
  const sorted = [...mouse.genes].sort((g1, g2) => g1.x - g2.x)
  // mouse: B at 0, A at 200 -> B is the leftmost slot.
  assert.equal(sorted[0]?.anchorId, 'B')
  assert.equal(sorted[1]?.anchorId, 'A')
})

test('geneArrowPath points right for + strand and left for - strand', () => {
  const g: GeneBox = { ...gene('A', 0), x: 10, width: 40 }
  assert.ok(geneArrowPath(g, 12).startsWith('M10,0'))
  assert.ok(geneArrowPath({ ...g, strand: -1 }, 12).startsWith('M50,0'))
})
