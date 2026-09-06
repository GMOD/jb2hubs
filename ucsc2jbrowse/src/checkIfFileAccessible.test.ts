import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  checkIfFileAccessible,
  flushFileAccessCaches,
} from './checkIfFileAccessible.ts'

// The cache is written to `fileAccessCache/` relative to cwd, which is how
// make.sh gets it under ucsc2jbrowse/. Each test runs in its own cwd so the real
// one is never touched.
//
// It is also memoized per assembly for the life of the process, so a cwd change
// alone does not clear it -- hence a distinct assembly name per test. That memo
// is deliberate (parallel processes each own one assembly's file), so the tests
// work with it rather than reaching in to reset it.
const url = 'https://hgdownload.soe.ucsc.edu/gbdb/hg38/_promoterAi/a.bw'

let counter = 0
const nextAssembly = () => `testAsm${counter++}`
// A probe records into the in-memory map and the run writes the files once at
// the end (see the dirty-set note in checkIfFileAccessible.ts), so reading a
// cache back means flushing first.
const readCache = (assembly: string) => {
  flushFileAccessCaches()
  const file = path.join('fileAccessCache', `${assembly}.json`)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
}

let cwd: string
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

beforeEach(() => {
  cwd = process.cwd()
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fileaccess-'))
  process.chdir(tmp)
  realFetch = globalThis.fetch
  process.env.CHECK_404 = 'true'
})

afterEach(() => {
  // While still in the temp cwd: a case that probed without reading the cache
  // back would otherwise stay dirty and be written to the repo root by the
  // exit handler.
  flushFileAccessCaches()
  process.chdir(cwd)
  fs.rmSync(tmp, { recursive: true, force: true })
  globalThis.fetch = realFetch
  delete process.env.CHECK_404
})

describe('checkIfFileAccessible', () => {
  it('accepts a file upstream serves, and remembers it', async () => {
    const assembly = nextAssembly()
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
    const assembly = nextAssembly()
    stubFetch(responds(404))
    assert.equal(await checkIfFileAccessible({ url, assembly }), false)
    assert.equal(readCache(assembly)[url].blocked, true)
  })

  // The outage case, and the reason this is not simply `!response.ok`. A run
  // during an hgdownload wobble must not strip tracks off every assembly it
  // touches -- and must not then refuse to look again for 90 days.
  it('keeps the track on a 5xx, and caches nothing', async () => {
    const assembly = nextAssembly()
    stubFetch(responds(503))
    assert.equal(
      await checkIfFileAccessible({ url, assembly }),
      true,
      'a server error says nothing about whether the file exists',
    )
    assert.deepEqual(readCache(assembly), {}, 'nothing is recorded from a 5xx')
  })

  it('keeps the track when the fetch throws, and caches nothing', async () => {
    const assembly = nextAssembly()
    stubFetch(throws('connect ETIMEDOUT'))
    assert.equal(await checkIfFileAccessible({ url, assembly }), true)
    assert.deepEqual(readCache(assembly), {})
  })

  it('does not re-probe a fresh answer', async () => {
    const assembly = nextAssembly()
    stubFetch(responds(200))
    await checkIfFileAccessible({ url, assembly })
    await checkIfFileAccessible({ url, assembly })
    assert.equal(calls.length, 1, 'the second call is served from the cache')
  })

  // A bare /gbdb path and the full url name the same file. Keying the cache on
  // whichever spelling the caller happened to use meant probing it twice and
  // recording it twice.
  it('keys a bare path and its full url as one entry', async () => {
    const assembly = nextAssembly()
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
    assert.equal(
      await checkIfFileAccessible({ url, assembly: nextAssembly() }),
      true,
    )
    assert.equal(calls.length, 0)
  })
})
