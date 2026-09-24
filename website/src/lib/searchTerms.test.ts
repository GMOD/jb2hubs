import assert from 'node:assert'
import { test } from 'node:test'

import { matchesAllTerms, searchTerms } from './searchTerms.ts'

test('searchTerms lowercases and splits on any whitespace', () => {
  assert.deepEqual(searchTerms('  Mus \tBRCA  '), ['mus', 'brca'])
  assert.deepEqual(searchTerms('   '), [])
})

test('every term has to match, in any order and any field', () => {
  const row = 'house mouse Mus musculus GRCm39 GCF_000001635.27'
  assert.ok(matchesAllTerms(row, searchTerms('musculus grcm39')))
  assert.ok(matchesAllTerms(row, searchTerms('GRCm39 house')))
  assert.ok(!matchesAllTerms(row, searchTerms('mus rattus')))
  assert.ok(matchesAllTerms(row, []))
})
