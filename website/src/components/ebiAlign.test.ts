import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { clustalOmega } from './ebiAlign.ts'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

// answers /run with a job id, /result with the name of what was asked for, and
// /status with each entry of `statuses` in turn
function stubEbi(statuses: (string | number)[]) {
  let i = 0
  globalThis.fetch = ((url: string) => {
    if (url.endsWith('/run')) {
      return Promise.resolve(new Response('clustalo-R1'))
    }
    if (url.includes('/result/')) {
      return Promise.resolve(new Response(url.split('/').at(-1)))
    }
    const next = statuses[Math.min(i++, statuses.length - 1)]!
    return Promise.resolve(
      typeof next === 'number'
        ? new Response('bad gateway', { status: next })
        : new Response(next),
    )
  }) as typeof fetch
}

test('clustalOmega: a status check EBI fails to answer is not the job failing', async () => {
  stubEbi(['RUNNING', 502, 'PENDING', 'FINISHED'])
  assert.deepEqual(await clustalOmega('>a\nMK', { pollMs: 1 }), {
    aligned: 'fa',
    newick: 'phylotree',
  })
})

test('clustalOmega: a job EBI reports failed ends the poll', async () => {
  stubEbi(['RUNNING', 'FAILURE'])
  await assert.rejects(
    clustalOmega('>a\nMK', { pollMs: 1 }),
    /EBI alignment job FAILURE/,
  )
})

test('clustalOmega: checks that never answer end at the deadline', async () => {
  stubEbi([502])
  await assert.rejects(
    clustalOmega('>a\nMK', { pollMs: 1, timeoutMs: 30 }),
    /timed out/,
  )
})
