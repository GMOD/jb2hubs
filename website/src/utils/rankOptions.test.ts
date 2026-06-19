import assert from 'node:assert'
import { test } from 'node:test'

import { rankBy, rankOptions } from './rankOptions.ts'

const opts = [
  { value: 'a', label: 'BRCA1' },
  { value: 'b', label: 'BRCA2' },
  { value: 'c', label: 'TP53' },
  { value: 'd', label: 'Homo sapiens' },
]

test('empty query returns the head of the list, capped', () => {
  assert.deepEqual(rankOptions('', opts, 2), [opts[0], opts[1]])
})

test('query filters to matches', () => {
  const labels = rankOptions('brca', opts).map(o => o.label)
  assert.deepEqual(labels.sort(), ['BRCA1', 'BRCA2'])
})

test('single-char typo within a term still matches (intraMode)', () => {
  const labels = rankOptions('brac1', opts).map(o => o.label)
  assert.deepEqual(labels, ['BRCA1'])
})

test('no match returns empty', () => {
  assert.deepEqual(rankOptions('zzzzz', opts), [])
})

test('rankBy keys off the supplied extractor', () => {
  const rows = [
    { gene1: 'TP53', gene2: 'Trp53' },
    { gene1: 'BRCA1', gene2: 'Brca1' },
  ]
  const hits = rankBy('brca', rows, r => r.gene1)
  assert.deepEqual(hits, [rows[1]])
})
