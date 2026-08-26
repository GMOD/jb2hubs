import assert from 'node:assert'
import { mock, test } from 'node:test'

import { fetchOrthologReports } from './ncbiFetch.ts'

// Capture the url fetchOrthologReports builds without going near NCBI. The
// throttle serialises through a module-level chain and sleeps between calls, so
// these run one at a time and cost the minimum gap.
async function urlFor(geneId: string, taxa?: number[]) {
  let seen = ''
  const original = globalThis.fetch
  mock.method(globalThis, 'fetch', (url: string) => {
    seen = url
    return Promise.resolve(new Response('{}', { status: 200 }))
  })
  try {
    await fetchOrthologReports(geneId, taxa)
  } finally {
    globalThis.fetch = original
  }
  return seen
}

test('an unscoped ortholog request carries no taxon filter', async () => {
  const url = await urlFor('672')
  assert.match(url, /\/gene\/id\/672\/orthologs\?returned_content=COMPLETE$/)
})

// The endpoint UNIONS repeated taxon_filter params, which is the only reason one
// request can ask for three sibling reptile clades at once.
test('each scope taxon becomes its own taxon_filter param', async () => {
  const url = await urlFor('672', [8504, 8459, 1294634])
  assert.match(
    url,
    /orthologs\?returned_content=COMPLETE&taxon_filter=8504&taxon_filter=8459&taxon_filter=1294634$/,
  )
})

test('an empty scope is the same request as no scope', async () => {
  assert.equal(await urlFor('672', []), await urlFor('672'))
})
