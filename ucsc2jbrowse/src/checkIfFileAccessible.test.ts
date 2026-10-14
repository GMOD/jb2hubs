import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  checkIfFileAccessible,
  flushFileAccessCaches,
  setFileAccessCacheDir,
  setFileAccessCachesReadOnly,
} from './checkIfFileAccessible.ts'

// Each test points the caches at its own temp dir, so the real one is never
// touched.
const url = 'https://hgdownload.soe.ucsc.edu/gbdb/hg38/_promoterAi/a.bw'

// beforeEach gives every case a fresh cache dir and memo
const assembly = 'testAsm'
// A probe records into the in-memory map and the run writes the files once at
// the end (see the dirty-set note in checkIfFileAccessible.ts), so reading a
// cache back means flushing first.
const readCache = (assembly: string) => {
  flushFileAccessCaches()
  const file = path.join(tmp, 'fileAccessCache', `${assembly}.json`)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
}

let tmp: string
let realFetch: typeof globalThis.fetch
let calls: string[]

function stubFetch(reply: (target: string) => Promise<unknown>) {
  calls = []
  globalThis.fetch = ((target: unknown) => {
    calls.push(String(target))
    return reply(String(target))
  }) as unknown as typeof globalThis.fetch
}

const responds = (status: number) => () =>
  Promise.resolve({ ok: status >= 200 && status < 300, status })
const throws = (message: string) => () => Promise.reject(new Error(message))
// The blip: one failed attempt, then upstream answers.
const thenResponds = (message: string, status: number) => {
  let first = true
  return () => {
    if (first) {
      first = false
      return Promise.reject(new Error(message))
    }
    return Promise.resolve({ ok: status >= 200 && status < 300, status })
  }
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fileaccess-'))
  setFileAccessCacheDir(path.join(tmp, 'fileAccessCache'))
  realFetch = globalThis.fetch
  process.env.CHECK_404 = 'true'
})

afterEach(() => {
  // While still pointed at the temp dir: a case that probed without reading the
  // cache back would otherwise stay dirty and be written to the real cache by
  // the exit handler.
  flushFileAccessCaches()
  setFileAccessCachesReadOnly(false)
  fs.rmSync(tmp, { recursive: true, force: true })
  globalThis.fetch = realFetch
  delete process.env.CHECK_404
})

describe('checkIfFileAccessible', () => {
  it('accepts a file upstream serves, and remembers it', async () => {
    stubFetch(responds(200))
    assert.equal(
      await checkIfFileAccessible({ url, assembly }),
      true,
      'a 200 means the track keeps its file',
    )
    assert.equal(readCache(assembly)[url].blocked, false)
  })

  // The promoterAi case: UCSC does not publish /gbdb/hg38/_promoterAi/, so
  // these four bigWigs shipped as 404s for months.
  it('blocks a 404 and records it so the track is dropped', async () => {
    stubFetch(responds(404))
    assert.equal(await checkIfFileAccessible({ url, assembly }), false)
    assert.equal(readCache(assembly)[url].blocked, true)
  })

  // The outage case, and the reason this is not simply `!response.ok`. A run
  // during an hgdownload wobble must not strip tracks off every assembly it
  // touches -- and must not then refuse to look again for 90 days.
  it('keeps the track on a 5xx, and caches nothing', async () => {
    stubFetch(responds(503))
    assert.equal(
      await checkIfFileAccessible({ url, assembly, retryDelayMs: 0 }),
      true,
      'a server error says nothing about whether the file exists',
    )
    assert.deepEqual(readCache(assembly), {}, 'nothing is recorded from a 5xx')
  })

  it('keeps the track when the fetch throws, and caches nothing', async () => {
    stubFetch(throws('connect ETIMEDOUT'))
    assert.equal(
      await checkIfFileAccessible({ url, assembly, retryDelayMs: 0 }),
      true,
    )
    assert.deepEqual(readCache(assembly), {})
    assert.equal(calls.length, 3, 'it asked again before giving up')
  })

  // hg38's alphaGenome composite: `a.bw` lost one `TypeError: fetch failed`
  // while c/g/t beside it answered 404 in the same second, so the only one of
  // the four that shipped was the one nothing had managed to ask about. A blip
  // is not a stall, and the second attempt gets the same 404 the others did.
  it('asks again after a blip, and blocks the 404 underneath it', async () => {
    stubFetch(thenResponds('fetch failed', 404))
    assert.equal(
      await checkIfFileAccessible({ url, assembly, retryDelayMs: 0 }),
      false,
    )
    assert.equal(calls.length, 2)
    assert.equal(readCache(assembly)[url].blocked, true)
  })

  // A 403 is a decision, not a bad day: asking twice gets the same answer.
  it('does not retry a definitive answer', async () => {
    stubFetch(responds(403))
    assert.equal(
      await checkIfFileAccessible({ url, assembly, retryDelayMs: 0 }),
      true,
    )
    assert.equal(calls.length, 1)
    assert.deepEqual(readCache(assembly), {})
  })

  it('does not re-probe a fresh answer', async () => {
    stubFetch(responds(200))
    await checkIfFileAccessible({ url, assembly })
    await checkIfFileAccessible({ url, assembly })
    assert.equal(calls.length, 1, 'the second call is served from the cache')
  })

  // A bare /gbdb path and the full url name the same file. Keying the cache on
  // whichever spelling the caller happened to use meant probing it twice and
  // recording it twice.
  it('keys a bare path and its full url as one entry', async () => {
    stubFetch(responds(404))
    await checkIfFileAccessible({
      url: '/gbdb/hg38/_promoterAi/a.bw',
      assembly,
    })
    assert.deepEqual(Object.keys(readCache(assembly)), [url])

    await checkIfFileAccessible({ url, assembly })
    assert.equal(calls.length, 1, 'the full url hits the bare path’s entry')
    assert.equal(calls[0], url, 'the bare path was resolved before fetching')
  })

  // The assembly is the caller's to supply. This used to be guessed from the
  // url with a regex over seven families, and everything else -- rn3, galGal6,
  // wuhCor1, most of the 238 -- was returned accessible without a request.
  it('checks an assembly whose name no url regex would recognise', async () => {
    stubFetch(responds(404))
    const gone =
      'https://hgdownload.soe.ucsc.edu/goldenPath/rn3/bigZips/rn3.2bit'
    assert.equal(
      await checkIfFileAccessible({ url: gone, assembly: 'rn3' }),
      false,
    )
    assert.equal(calls.length, 1, 'it was actually probed')
  })

  it('is the identity with CHECK_404 unset, and never touches the network', async () => {
    delete process.env.CHECK_404
    stubFetch(responds(404))
    assert.equal(await checkIfFileAccessible({ url, assembly }), true)
    assert.equal(calls.length, 0)
  })

  const DAY = 24 * 60 * 60 * 1000
  const seed = (entries: Record<string, number>, blocked = false) => {
    const dir = path.join(tmp, 'fileAccessCache')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, `${assembly}.json`),
      JSON.stringify(
        Object.fromEntries(
          Object.entries(entries).map(([u, lastChecked]) => [
            u,
            { lastChecked, blocked },
          ]),
        ),
      ),
    )
  }

  describe('expiry', () => {
    it('trusts an entry younger than 90 days', async () => {
      seed({ [url]: Date.now() - 80 * DAY })
      stubFetch(responds(200))
      await checkIfFileAccessible({ url, assembly })
      assert.equal(calls.length, 0)
    })

    it('re-probes every entry older than 135 days', async () => {
      seed({ [url]: Date.now() - 136 * DAY })
      stubFetch(responds(200))
      await checkIfFileAccessible({ url, assembly })
      assert.equal(calls.length, 1)
    })

    it('spreads expiry across 90 to 135 days by url', async () => {
      const urls = Array.from(
        { length: 200 },
        (_, i) => `https://hgdownload.soe.ucsc.edu/gbdb/hg38/f${i}.bw`,
      )
      seed(Object.fromEntries(urls.map(u => [u, Date.now() - 110 * DAY])))
      stubFetch(responds(200))
      for (const u of urls) {
        await checkIfFileAccessible({ url: u, assembly })
      }
      assert.ok(calls.length > 20 && calls.length < 180, `${calls.length}`)
    })
  })

  describe('read-only caches', () => {
    it('answers from an expired entry and never probes', async () => {
      seed({ [url]: 1 }, true)
      delete process.env.CHECK_404
      setFileAccessCachesReadOnly(true)
      stubFetch(responds(200))
      assert.equal(await checkIfFileAccessible({ url, assembly }), false)
      assert.equal(calls.length, 0)
    })

    it('keeps an unknown url, probes nothing and writes nothing', async () => {
      setFileAccessCachesReadOnly(true)
      stubFetch(responds(404))
      assert.equal(await checkIfFileAccessible({ url, assembly }), true)
      assert.equal(calls.length, 0)
      flushFileAccessCaches()
      assert.equal(fs.existsSync(path.join(tmp, 'fileAccessCache')), false)
    })
  })
})
