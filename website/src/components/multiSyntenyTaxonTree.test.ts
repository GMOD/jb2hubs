import assert from 'node:assert'
import { test } from 'node:test'

import {
  buildAncestors,
  buildInducedTree,
  collapseChains,
  leafOrder,
} from './multiSyntenyTaxonTree.ts'

import type { TaxonNode } from './multiSyntenyTaxonTree.ts'

// root(1) -> Euarchontoglires(2) -> { Primates(3) -> {human 9606, mouse-lemur 30608}, rodent 10090 }
const edges = {
  '1': { scientific_name: 'root', visible_children: [2] },
  '2': { scientific_name: 'Euarchontoglires', visible_children: [3, 10090] },
  '3': { scientific_name: 'Primates', visible_children: [9606, 30608] },
  '9606': { scientific_name: 'Homo sapiens', curator_common_name: 'human' },
  '30608': { scientific_name: 'Microcebus murinus' },
  '10090': { scientific_name: 'Mus musculus', curator_common_name: 'mouse' },
}

test('buildInducedTree keeps only branches leading to requested taxa', () => {
  const tree = buildInducedTree(edges, [9606, 10090])
  assert.ok(tree)
  // Microcebus (30608) was not requested, so the Primates node collapses to just human.
  const leaves = leafOrder(tree)
  assert.deepEqual(leaves, [9606, 10090])
})

test('requested taxa terminate the descent (rendered as leaves)', () => {
  // Request Primates(3) itself: its subspecies must not become extra rows.
  const tree = buildInducedTree(edges, [3, 10090])
  assert.ok(tree)
  assert.deepEqual(leafOrder(tree), [3, 10090])
})

test('collapseChains drops single-child internal nodes down to branch points', () => {
  const tree = buildInducedTree(edges, [9606, 10090])
  assert.ok(tree)
  // root and Euarchontoglires are a single-child chain above the first split.
  const collapsed = collapseChains(tree)
  assert.equal(collapsed.children.length, 2)
  assert.equal(collapsed.name, 'Euarchontoglires')
})

test('leafOrder is a left-to-right DFS', () => {
  const node: TaxonNode = {
    taxonId: 0,
    name: 'r',
    children: [
      {
        taxonId: 0,
        name: 'a',
        children: [
          { taxonId: 1, name: '1', children: [] },
          { taxonId: 2, name: '2', children: [] },
        ],
      },
      { taxonId: 3, name: '3', children: [] },
    ],
  }
  assert.deepEqual(leafOrder(node), [1, 2, 3])
})

test('buildInducedTree returns undefined when no requested taxon is present', () => {
  assert.equal(buildInducedTree(edges, [99999]), undefined)
})

// The clade grouping asks "is this species inside Primates" with an id test, so
// the lineage has to run all the way to the root and include the taxon itself.
test('buildAncestors returns each taxon plus its whole root-ward path', () => {
  const lineages = buildAncestors(edges, [9606, 10090])
  assert.deepEqual(
    [...(lineages.get(9606) ?? [])].sort((a, b) => a - b),
    [1, 2, 3, 9606],
  )
  assert.deepEqual(
    [...(lineages.get(10090) ?? [])].sort((a, b) => a - b),
    [1, 2, 10090],
  )
})

// A taxon the API left out of the subtree still gets a row in the table, so it
// gets a lineage of just itself rather than being absent from the map.
test('buildAncestors gives an unknown taxon a lineage of itself', () => {
  assert.deepEqual([...(buildAncestors(edges, [4242]).get(4242) ?? [])], [4242])
})

// A cyclic edge is not something NCBI sends, but walking one would hang the
// page rather than fail visibly, which is the worst way for it to go wrong.
test('buildAncestors terminates on a cyclic edge', () => {
  const cyclic = {
    '1': { visible_children: [2] },
    '2': { visible_children: [1] },
  }
  assert.deepEqual([...(buildAncestors(cyclic, [2]).get(2) ?? [])], [2, 1])
})
