import assert from 'node:assert'
import { test } from 'node:test'

import { getNeighborhood, neighborhoodUrl } from './neighborhoodClient.ts'

import type { ClientIo } from './neighborhoodClient.ts'

const nb = {
  query: { geneId: '672', symbol: 'BRCA1', refTaxonId: 9606 },
  anchors: [],
  species: [],
}

function io(...responses: (Response | Error)[]): ClientIo & { calls: number } {
  const queue = [...responses]
  const state = {
    calls: 0,
    fetch: () => {
      state.calls += 1
      const next = queue.shift()
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve(next ?? new Response('', { status: 500 }))
    },
    wait: () => Promise.resolve(),
  }
  return state
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

test('the url names the api, the gene, the reference and both options', () => {
  assert.equal(
    neighborhoodUrl('BRCA1', 9606, { flankBp: 150_000, maxAnchors: 11 }),
    'https://qkeuv38wf2.execute-api.us-east-2.amazonaws.com/prod/ortholog-set?gene=BRCA1&ref=9606&flank=150000&maxAnchors=11',
  )
})

test('a 200 with a neighborhood body is returned as is', async () => {
  const fake = io(json(nb))
  assert.deepEqual(await getNeighborhood('BRCA1', 9606, {}, fake), nb)
  assert.equal(fake.calls, 1)
})

// The Lambda's 502 carries the line worth showing; it used to be discarded and
// the browser assembled the same failure again.
test("a 502 throws the Lambda's own message and does not retry", async () => {
  const fake = io(json({ error: 'x', message: 'no gene found for "FOO"' }, 502))
  await assert.rejects(getNeighborhood('FOO', 9606, {}, fake), {
    message: 'no gene found for "FOO"',
  })
  assert.equal(fake.calls, 1)
})

test('a 400 with no message falls back to the status line', async () => {
  const fake = io(
    new Response('not json', { status: 400, statusText: 'Bad Request' }),
  )
  await assert.rejects(getNeighborhood('FOO', 9606, {}, fake), {
    message: '400 Bad Request',
  })
})

// A cold miss can outlive API Gateway's integration limit; the Lambda keeps
// going and writes the cache, so one retry reads the answer back.
test('a 504 is retried once and the retry is returned', async () => {
  const fake = io(new Response('', { status: 504 }), json(nb))
  assert.deepEqual(await getNeighborhood('BRCA1', 9606, {}, fake), nb)
  assert.equal(fake.calls, 2)
})

test('a network failure is retried once, then surfaces', async () => {
  const fake = io(new TypeError('fetch failed'), new TypeError('fetch failed'))
  await assert.rejects(getNeighborhood('BRCA1', 9606, {}, fake), {
    message: 'fetch failed',
  })
  assert.equal(fake.calls, 2)
})

test('a 200 that is not a neighborhood is an error, not a cast', async () => {
  const fake = io(json({ hello: 'world' }))
  await assert.rejects(
    getNeighborhood('BRCA1', 9606, {}, fake),
    /not a neighborhood/,
  )
})
