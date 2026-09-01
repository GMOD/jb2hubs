import assert from 'node:assert'
import { test } from 'node:test'

import { makeComparator } from './utils.ts'

const byName = (rows: string[], desc = false) =>
  rows.toSorted(makeComparator(r => r, desc))

test('strings sort case-insensitively', () => {
  assert.deepEqual(byName(['zebra', 'Aardvark', 'mouse']), [
    'Aardvark',
    'mouse',
    'zebra',
  ])
})

test('digit runs inside strings sort as numbers', () => {
  assert.deepEqual(byName(['chr10', 'chr2', 'chr1']), ['chr1', 'chr2', 'chr10'])
})

test('numbers sort numerically, not lexically', () => {
  const rows = [10, 9, 100]
  assert.deepEqual(rows.toSorted(makeComparator(r => r, false)), [9, 10, 100])
})

test('desc reverses the order and equal values stay equal', () => {
  assert.deepEqual(byName(['a', 'c', 'b'], true), ['c', 'b', 'a'])
  assert.equal(makeComparator((r: string) => r, true)('x', 'X'), 0)
})
