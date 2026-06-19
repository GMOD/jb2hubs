import assert from 'node:assert'
import { test } from 'node:test'

import { StaticFileOrthologAdapter, pairKey } from './orthologAdapter.ts'

test('pairKey is order-independent (lo_hi canonical)', () => {
  assert.equal(pairKey(9606, 10090), '9606_10090')
  assert.equal(pairKey(10090, 9606), '9606_10090')
})

test('hasPair: cross-species checks the pairs set, both orderings', () => {
  const a = new StaticFileOrthologAdapter(['9606_10090'], [])
  assert.equal(a.hasPair(9606, 10090), true)
  assert.equal(a.hasPair(10090, 9606), true)
  assert.equal(a.hasPair(9606, 7227), false)
})

test('hasPair: same-species checks the taxa set, not pairs', () => {
  const a = new StaticFileOrthologAdapter([], [9606])
  assert.equal(a.hasPair(9606, 9606), true)
  assert.equal(a.hasPair(10090, 10090), false)
})

test('queryGenes returns empty without fetch when no table exists', async () => {
  const a = new StaticFileOrthologAdapter([], [])
  assert.deepEqual(
    await a.queryGenes({ taxon1: 9606, taxon2: 10090, search: 'brca' }),
    [],
  )
})
