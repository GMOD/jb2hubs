import assert from 'node:assert'
import { mock, test } from 'node:test'

import { createStore, loadStore } from './orthologDb.ts'

import type { AssemblyIndex } from './orthologDb.ts'

const index: AssemblyIndex = {
  schema: 'ortholog-index/2',
  accessions: [
    'GCF_000001405.40',
    'GCF_000001635.27',
    'GCF_000001635.9',
    'GCA_009914755.4',
  ],
  ucscDb: {
    'GCF_000001405.40': 'hg38',
    'GCF_000001635.27': 'mm39',
    'GCF_000001635.9': 'mm10',
  },
}

test('an exact accession resolves to its own entry', () => {
  const found = createStore(index).find('GCF_000001635.9')
  assert.equal(found?.ucscDb, 'mm10')
  assert.equal(found?.exact, true)
})

// NCBI sometimes names a version of an assembly we do not host, and the
// fallback is what keeps that row on a genome we do; `exact` is what tells the
// caller whose coordinates it holds.
test('an unhosted version falls back to the same base accession', () => {
  const found = createStore(index).find('GCF_000001405.99')
  assert.equal(found?.accession, 'GCF_000001405.40')
  assert.equal(found?.ucscDb, 'hg38')
  assert.equal(found?.exact, false)
})

// Two versions of one base are both hosted here (mm39 and mm10), so "whichever
// came last in the list" would make this depend on how the index happened to be
// written.
test('the fallback picks the newest hosted version, not the last entry', () => {
  const found = createStore(index).find('GCF_000001635.1')
  assert.equal(found?.accession, 'GCF_000001635.27')
  assert.equal(found?.ucscDb, 'mm39')
})

test('an unknown accession is undefined rather than a half-built assembly', () => {
  assert.equal(createStore(index).find('GCF_999999999.1'), undefined)
})

test('ucscDb is absent for GenArk-only assemblies', () => {
  assert.equal(createStore(index).find('GCA_009914755.4')?.ucscDb, undefined)
})

// The memo used to keep the rejected promise, so one failed download left every
// ortholog search on the page failing until a reload.
test('a failed index load is retried by the next caller', async () => {
  let calls = 0
  const original = globalThis.fetch
  mock.method(globalThis, 'fetch', () => {
    calls += 1
    return Promise.resolve(
      calls === 1
        ? new Response('', { status: 503 })
        : new Response(JSON.stringify(index), { status: 200 }),
    )
  })
  try {
    await assert.rejects(loadStore())
    const store = await loadStore()
    assert.equal(store.find('GCF_000001635.9')?.ucscDb, 'mm10')
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = original
  }
})
