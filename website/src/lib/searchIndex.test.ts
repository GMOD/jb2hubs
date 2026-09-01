import assert from 'node:assert'
import { test } from 'node:test'

import { IS_REFERENCE, IS_SUPPRESSED, ncbiStatusOf } from './searchIndex.ts'

test('the two status bits are distinct and combine', () => {
  assert.equal(IS_REFERENCE & IS_SUPPRESSED, 0)
  assert.equal(ncbiStatusOf({}), 0)
  assert.equal(ncbiStatusOf({ ncbiRefSeqCategory: 'reference genome' }), 1)
  assert.equal(ncbiStatusOf({ suppressed: true }), 2)
  assert.equal(
    ncbiStatusOf({ ncbiRefSeqCategory: 'reference genome', suppressed: true }),
    IS_REFERENCE | IS_SUPPRESSED,
  )
})

test('a representative genome is not a reference genome', () => {
  assert.equal(
    ncbiStatusOf({ ncbiRefSeqCategory: 'representative genome' }) &
      IS_REFERENCE,
    0,
  )
})
