import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  classify,
  CONTROL_URL,
  isDegraded,
  PROBE_URL,
  probeUcscLiveness,
  SLOW_THRESHOLD_MS,
} from './ucscLiveness.ts'

const fast = { timedOut: false, ok: true, elapsedMs: 150 }
const timedOut = { timedOut: true, ok: false, elapsedMs: 6000 }

describe('classify', () => {
  it('is ok when both answer quickly', () => {
    assert.equal(classify({ ucsc: fast, control: fast }), 'ok')
  })

  // The failure this whole module exists for.
  it('is stalled when UCSC times out and the baseline is healthy', () => {
    assert.equal(classify({ ucsc: timedOut, control: fast }), 'stalled')
  })

  // The false alarm it exists to avoid. A dropped connection times out against
  // hgdownload exactly as it does against us, and blaming UCSC for someone's
  // own wifi would put a wrong warning on every page.
  it('says nothing when the baseline times out too', () => {
    assert.equal(classify({ ucsc: timedOut, control: timedOut }), 'unknown')
  })

  it('says nothing when the baseline is merely very slow', () => {
    assert.equal(
      classify({
        ucsc: timedOut,
        control: { timedOut: false, ok: true, elapsedMs: 4000 },
      }),
      'unknown',
      'a 4s round trip to our own CDN means the reader has no usable baseline',
    )
  })

  it('warns when UCSC answers but far slower than threshold', () => {
    assert.equal(
      classify({
        ucsc: { timedOut: false, ok: true, elapsedMs: SLOW_THRESHOLD_MS + 1 },
        control: fast,
      }),
      'slow',
    )
  })

  it('does not warn just under the threshold', () => {
    assert.equal(
      classify({
        ucsc: { timedOut: false, ok: true, elapsedMs: SLOW_THRESHOLD_MS - 1 },
        control: fast,
      }),
      'ok',
    )
  })

  // A 5xx is upstream having a bad day, but it is answering. Describing it as
  // the hang would be describing the wrong failure.
  it('says nothing about a non-timeout error status', () => {
    assert.equal(
      classify({
        ucsc: { timedOut: false, ok: false, elapsedMs: 200 },
        control: fast,
      }),
      'unknown',
    )
  })

  it('only stalled and slow are shown to readers', () => {
    assert.deepEqual(
      (['ok', 'slow', 'stalled', 'unknown'] as const).filter(isDegraded),
      ['slow', 'stalled'],
    )
  })
})

const realLocalStorage = globalThis.localStorage
const realFetch = globalThis.fetch

function stubStorage() {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    },
  })
  return store
}

function restore() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: realLocalStorage,
  })
  globalThis.fetch = realFetch
}

afterEach(restore)

describe('probeUcscLiveness', () => {
  it('probes UCSC and the control together, both as bodiless HEADs', async () => {
    stubStorage()
    const calls: { url: string; method?: string }[] = []
    const result = await probeUcscLiveness({
      fetchImpl: ((url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method })
        return Promise.resolve({ ok: true } as Response)
      }) as unknown as typeof globalThis.fetch,
      now: () => 1000,
    })
    assert.deepEqual(
      calls.map(c => c.url).sort(),
      [CONTROL_URL, PROBE_URL].sort(),
    )
    assert.deepEqual([...new Set(calls.map(c => c.method))], ['HEAD'])
    assert.equal(result.verdict, 'ok')
  })

  it('reuses a cached verdict rather than re-probing', async () => {
    stubStorage()
    let calls = 0
    const fetchImpl = (() => {
      calls++
      return Promise.resolve({ ok: true } as Response)
    }) as unknown as typeof globalThis.fetch

    await probeUcscLiveness({ fetchImpl, now: () => 1000 })
    assert.equal(calls, 2, 'first probe asks both hosts')
    await probeUcscLiveness({ fetchImpl, now: () => 1000 })
    assert.equal(calls, 2, 'second is served from the cache')
  })

  // Caching "we learned nothing" would suppress the next real probe for the
  // whole TTL, which is the window a reader is most likely to want an answer in.
  it('does not cache an inconclusive verdict', async () => {
    const store = stubStorage()
    const fetchImpl = (() =>
      Promise.reject(
        Object.assign(new Error('nope'), { name: 'TimeoutError' }),
      )) as unknown as typeof globalThis.fetch

    const result = await probeUcscLiveness({ fetchImpl, now: () => 1000 })
    assert.equal(
      result.verdict,
      'unknown',
      'both hosts timed out, so nothing is known about UCSC',
    )
    assert.equal(store.size, 0)
  })

  it('survives localStorage throwing outright', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('site data blocked')
      },
    })
    const result = await probeUcscLiveness({
      fetchImpl: (() =>
        Promise.resolve({
          ok: true,
        } as Response)) as unknown as typeof globalThis.fetch,
      now: () => 1000,
    })
    assert.equal(result.verdict, 'ok')
  })
})
