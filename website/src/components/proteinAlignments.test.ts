import assert from 'node:assert'
import { test } from 'node:test'

import { fitPlacement } from './proteinAlignments.ts'

import type { PlacedQuery } from './pfamSeed.ts'

// A stand-in placement: one row per character of budget, up to the seed's
// hundred, a tree when asked, so the measure is the row count plus the tree.
function fakePlace(maxChars: number, withTree: boolean): PlacedQuery {
  const rows = Math.max(0, Math.min(100, Math.floor(maxChars)))
  return {
    fasta: 'x'.repeat(rows),
    newick: withTree ? 'tree' : undefined,
    queryName: 'Q/1-9',
    anchor: { name: 'A/1-9', score: 1, identity: 1 },
    domain: { start: 1, end: 9 },
    kept: rows,
    total: 100,
    thinned: rows < 100,
    replaced: false,
  }
}
const measure = (p: PlacedQuery) => p.fasta.length + (p.newick ? 50 : 0)

test('fitPlacement: no room limit is the whole seed with its tree', () => {
  const placed = fitPlacement(fakePlace, undefined, measure)
  assert.strictEqual(placed.kept, 100)
  assert.strictEqual(placed.newick, 'tree')
})

test('fitPlacement: the tree goes before any row', () => {
  const placed = fitPlacement(fakePlace, 120, measure)
  assert.strictEqual(placed.kept, 100)
  assert.strictEqual(placed.newick, undefined)
})

test('fitPlacement: rows are thinned by steps until the alignment fits', () => {
  const placed = fitPlacement(fakePlace, 60, measure)
  assert.ok(placed.kept <= 60, `${placed.kept} rows`)
  assert.ok(placed.kept >= 40, `${placed.kept} rows`)
  assert.strictEqual(placed.newick, undefined)
  assert.strictEqual(placed.thinned, true)
})

test('fitPlacement: a thinned alignment keeps its tree when the tree fits beside the rows', () => {
  const cheapTree = (p: PlacedQuery) => p.fasta.length + (p.newick ? 5 : 0)
  const placed = fitPlacement(fakePlace, 62, cheapTree)
  assert.strictEqual(placed.kept, 56)
  assert.strictEqual(placed.newick, 'tree')
  assert.strictEqual(placed.thinned, true)
})

test('fitPlacement: a room nothing fits ends at the anchor alone', () => {
  const placed = fitPlacement(fakePlace, 0, measure)
  assert.strictEqual(placed.kept, 1)
})
