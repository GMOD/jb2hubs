import assert from 'node:assert/strict'
import { test } from 'node:test'

import { delay, within } from './delay.ts'
import { isTimeout } from './fetchJson.ts'

test('within: an answer inside the wait is the answer', async () => {
  assert.equal(
    await within(Promise.resolve('lineages'), 50, 'NCBI'),
    'lineages',
  )
})

test('within: a late answer is a TimeoutError, not an answer to cache', async () => {
  const late = delay(40).then(() => 'lineages')
  await assert.rejects(within(late, 5, 'NCBI taxonomy'), (e: unknown) => {
    assert.ok(isTimeout(e))
    assert.equal(e.message, 'NCBI taxonomy gave no answer in 0.005 s')
    return true
  })
  await late
})

test('within: a failure inside the wait is that failure', async () => {
  await assert.rejects(
    within(Promise.reject(new RangeError('bug')), 50, 'NCBI'),
    RangeError,
  )
})
