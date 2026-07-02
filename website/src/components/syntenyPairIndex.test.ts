import assert from 'node:assert'
import { test } from 'node:test'

import {
  accessionBase,
  buildPairIndex,
  trackFor,
} from './syntenyPairIndex.ts'

test('accessionBase strips version and assembly-name suffix', () => {
  assert.equal(accessionBase('GCF_000001405.40'), 'GCF_000001405')
  assert.equal(accessionBase('GCF_000001735.4_TAIR10.1'), 'GCF_000001735')
  // No underscore-id shape (e.g. UCSC db names) passes through untouched.
  assert.equal(accessionBase('hg38'), 'hg38')
})

test('trackFor matches regardless of version, name suffix, or key order', () => {
  const index = buildPairIndex({
    'GCF_000001735.3,GCF_000001735.4_TAIR10.1': 'liftOver',
    'GCF_000002315.6,GCF_004027225.2': 'chicken',
  })
  // Caller holds a different version than the catalog key.
  assert.equal(
    trackFor(index, 'GCF_000001735.9', 'GCF_000001735.1'),
    'liftOver',
  )
  // Reversed order still resolves.
  assert.equal(trackFor(index, 'GCF_004027225.2', 'GCF_000002315.6'), 'chicken')
  assert.equal(trackFor(index, 'GCF_000002315.6', 'GCF_999999999.1'), undefined)
})
