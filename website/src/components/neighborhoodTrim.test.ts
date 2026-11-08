import assert from 'node:assert'
import { test } from 'node:test'

import { leafOrder } from './multiSyntenyTaxonTree.ts'
import { kinshipRings, trimNeighborhood } from './neighborhoodTrim.ts'

import type { TaxonNode } from './multiSyntenyTaxonTree.ts'
import type { Neighborhood, PlacedGene, SpeciesRow } from './neighborhood.ts'

function placed(n: number): PlacedGene[] {
  return Array.from({ length: n }, (_, i) => ({
    anchorId: `a${i}`,
    symbol: `G${i}`,
    assembly: 'GCF_1',
    refName: 'NC_1',
    chromosome: '1',
    start: i * 10,
    end: i * 10 + 5,
    strand: 1,
  }))
}

function neighborhood(species: SpeciesRow[], refTaxonId: number): Neighborhood {
  return {
    query: { geneId: '1', symbol: 'X', refTaxonId },
    anchors: [],
    species,
  }
}

test('trimNeighborhood drops rows with one anchor and keeps the rest in order', () => {
  const nb = neighborhood(
    [
      { taxonId: 1, genes: placed(1) },
      { taxonId: 2, genes: placed(3) },
      { taxonId: 3, genes: placed(2) },
    ],
    2,
  )
  const { nb: out, eligible } = trimNeighborhood(nb)
  assert.deepEqual(
    out.species.map(s => s.taxonId),
    [2, 3],
  )
  assert.equal(eligible, 2)
})

// ((((ref, sister), cousins x3), (mouse=10090, rodents x20)), far x30), with
// leaves numbered so the clade each came from reads off the id.
function ringTree(): TaxonNode {
  const leaf = (taxonId: number): TaxonNode => ({
    taxonId,
    name: String(taxonId),
    children: [],
  })
  const node = (taxonId: number, children: TaxonNode[]): TaxonNode => ({
    taxonId,
    name: String(taxonId),
    children,
  })
  const range = (from: number, n: number) =>
    Array.from({ length: n }, (_, i) => leaf(from + i))
  return node(1, [
    node(2, [
      node(3, [node(4, [leaf(9606), leaf(500)]), ...range(600, 3)]),
      node(5, [leaf(10090), ...range(700, 20)]),
    ]),
    node(6, range(800, 30)),
  ])
}

test('kinshipRings walks outward from the reference, one clade at a time', () => {
  assert.deepEqual(
    kinshipRings(ringTree(), 9606).map(r => r.length),
    [1, 3, 21, 30],
  )
  assert.deepEqual(kinshipRings(ringTree(), 9606)[0], [500])
})

test('trimNeighborhood keeps close relatives, model organisms and a sample of far clades', () => {
  const tree = ringTree()
  const species = leafOrder(tree).map(taxonId => ({
    taxonId,
    genes: placed(2),
  }))
  const nb = { ...neighborhood(species, 9606), tree }
  const { nb: out, eligible } = trimNeighborhood(nb, 12)
  const kept = out.species.map(s => s.taxonId)
  assert.equal(eligible, 56)
  assert.equal(kept.length, 12)
  for (const t of [9606, 500, 600, 601, 602, 10090]) {
    assert.ok(kept.includes(t), `keeps ${t}`)
  }
  assert.ok(kept.some(t => t >= 700 && t < 800))
  assert.ok(kept.some(t => t >= 800))
  assert.deepEqual(
    kept,
    leafOrder(tree).filter(t => kept.includes(t)),
    'tree order is kept',
  )
})

test('trimNeighborhood without a tree samples the whole list evenly', () => {
  const species = Array.from({ length: 200 }, (_, i) => ({
    taxonId: i,
    genes: placed(2),
  }))
  const { nb: out } = trimNeighborhood(neighborhood(species, 150))
  assert.equal(out.species.length, 80)
  assert.ok(out.species.some(s => s.taxonId === 150))
  assert.ok((out.species[0]?.taxonId ?? 99) < 5)
  assert.ok((out.species.at(-1)?.taxonId ?? 0) > 195)
})
