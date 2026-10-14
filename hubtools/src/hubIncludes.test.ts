import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { fetchIncludes, includeNames, spliceIncludes } from './hubIncludes.ts'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('includeNames', () => {
  it('lists the files named by include lines', () => {
    assert.deepEqual(
      includeNames('track a\n\ninclude x.txt\ninclude y.txt alpha\n'),
      ['x.txt', 'y.txt'],
    )
  })
})

describe('spliceIncludes', () => {
  it('puts the included text where the include line was', () => {
    assert.equal(
      spliceIncludes('a\ninclude x.txt\nb', { 'x.txt': 'X' }),
      'a\n\nX\n\nb',
    )
  })

  it('drops a line whose file is missing, and stops on a cycle', () => {
    assert.equal(spliceIncludes('include nope.txt', {}), '')
    assert.doesNotThrow(() =>
      spliceIncludes('include a', { a: 'include b', b: 'include a' }),
    )
  })
})

describe('fetchIncludes', () => {
  it('fetches relative to the hub, nested includes too', async () => {
    const asked: string[] = []
    globalThis.fetch = async (input: string | URL | Request) => {
      asked.push(String(input))
      return new Response(
        String(input).endsWith('a.txt') ? 'include b.txt' : 'B',
      )
    }
    const got = await fetchIncludes(
      'include a.txt',
      'https://example.org/h/hub.txt',
    )
    assert.deepEqual(got, { 'a.txt': 'include b.txt', 'b.txt': 'B' })
    assert.deepEqual(asked.sort(), [
      'https://example.org/h/a.txt',
      'https://example.org/h/b.txt',
    ])
  })

  it('resolves a nested include against the file that names it', async () => {
    const asked: string[] = []
    globalThis.fetch = async (input: string | URL | Request) => {
      asked.push(String(input))
      return new Response(
        String(input).endsWith('a.txt') ? 'include b.txt' : 'B',
      )
    }
    await fetchIncludes('include sub/a.txt', 'https://example.org/h/hub.txt')
    assert.deepEqual(asked.sort(), [
      'https://example.org/h/sub/a.txt',
      'https://example.org/h/sub/b.txt',
    ])
  })

  it('skips a 404 and throws on a 500', async () => {
    globalThis.fetch = async () => new Response('', { status: 404 })
    assert.deepEqual(
      await fetchIncludes('include a.txt', 'https://example.org/hub.txt'),
      {},
    )
    globalThis.fetch = async () => new Response('', { status: 500 })
    await assert.rejects(
      fetchIncludes('include a.txt', 'https://example.org/hub.txt'),
    )
  })
})
