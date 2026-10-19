import assert from 'node:assert'
import { mock, test } from 'node:test'

import { fetchJson } from './fetchJson.ts'

async function signalFor(url: string) {
  let signal: AbortSignal | null | undefined
  const original = globalThis.fetch
  mock.method(globalThis, 'fetch', (_url: string, init?: RequestInit) => {
    signal = init?.signal
    return Promise.resolve(new Response('{}', { status: 200 }))
  })
  try {
    await fetchJson(url)
  } finally {
    globalThis.fetch = original
  }
  return signal
}

test('a third-party read has a deadline, a site asset none', async () => {
  assert.ok(await signalFor('https://rest.uniprot.org/uniprotkb/P04637.json'))
  assert.equal(await signalFor('/searchIndex.json'), undefined)
  assert.ok(await signalFor('//cdn.example.org/a.json'))
})
