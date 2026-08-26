import assert from 'node:assert'
import { test } from 'node:test'

import { rankSymbols } from './geneSearch.ts'

// mygene's prefix search does not lead with the obvious answer: `symbol:TP5*` in
// human returns TP53TG3C, TP53TG1, TP53RK and buries TP53, so a reader typing
// "TP5" would not see the gene they meant in the list.
test('rankSymbols: the exact match leads, then the shortest', () => {
  assert.deepEqual(
    rankSymbols(['TP53TG3C', 'TP53TG1', 'TP53RK', 'TP53', 'TP53I11'], 'TP53'),
    ['TP53', 'TP53RK', 'TP53I11', 'TP53TG1', 'TP53TG3C'],
  )
})

test('rankSymbols: with no exact match, shortest first', () => {
  assert.deepEqual(rankSymbols(['TP53TG1', 'TP53RK'], 'TP5'), [
    'TP53RK',
    'TP53TG1',
  ])
})

// Species differ in how they case symbols (TP53 / Trp53 / tp53), and someone
// typing lowercase still means the gene.
test('rankSymbols: the exact match is case-insensitive', () => {
  assert.equal(rankSymbols(['shhb', 'shha'], 'SHHA')[0], 'shha')
})

test('rankSymbols: equal-length siblings keep a stable alphabetical order', () => {
  assert.deepEqual(rankSymbols(['CDC8', 'CDC3', 'CDC1'], 'CDC'), [
    'CDC1',
    'CDC3',
    'CDC8',
  ])
})

test('rankSymbols: duplicates collapse', () => {
  assert.deepEqual(rankSymbols(['AG', 'AG', 'AGL'], 'AG'), ['AG', 'AGL'])
})
