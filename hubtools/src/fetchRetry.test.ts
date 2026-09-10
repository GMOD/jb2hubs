import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { HttpError, myfetch, myfetchtextWithRetry } from './util.ts'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

// Records every url asked for, answering each through `respond`, which throws
// to stand in for a host that is not answering.
function stubFetch(asked: string[], respond: (url: string) => string) {
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = String(input)
    asked.push(url)
    return new Response(respond(url))
  }
}

describe('myfetch', () => {
  // The failure this guards is a server that accepts the connection and then
  // says nothing. A bare `fetch` never returns from that -- measured at 45s and
  // still hanging on node 24.2.0 -- so the retry and the hgdownload2 fallback
  // below it are unreachable during the one outage they exist for. Without the
  // deadline this test does not fail, it hangs, which is the point.
  it('gives up on a host that accepts the connection and never answers', async () => {
    globalThis.fetch = async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'))
        })
      })
    await assert.rejects(myfetch('https://hgdownload.soe.ucsc.edu/hub.txt', 50))
  })
})

describe('myfetchtextWithRetry', () => {
  it('reads hgdownload2 when the primary refuses the connection', async () => {
    const asked: string[] = []
    stubFetch(asked, url => {
      if (url.includes('hgdownload.soe')) {
        throw new Error('connect ECONNREFUSED 128.114.119.163:443')
      }
      return 'hub gcf'
    })
    const got = await myfetchtextWithRetry(
      'https://hgdownload.soe.ucsc.edu/hubs/GCF/hub.txt',
    )
    assert.equal(got, 'hub gcf')
    assert.deepEqual(asked, [
      'https://hgdownload.soe.ucsc.edu/hubs/GCF/hub.txt',
      'https://hgdownload2.soe.ucsc.edu/hubs/GCF/hub.txt',
    ])
  })

  it('asks the primary only, when it answers', async () => {
    const asked: string[] = []
    stubFetch(asked, () => 'hub')
    assert.equal(
      await myfetchtextWithRetry('https://hgdownload.soe.ucsc.edu/hub.txt'),
      'hub',
    )
    assert.deepEqual(asked, ['https://hgdownload.soe.ucsc.edu/hub.txt'])
  })

  it('stops after one round when both hosts say the file is gone', async () => {
    // A retired hub is not a bad day: asking a 404 three times over two hosts
    // was six requests and six seconds of backoff to be told the same thing.
    const asked: string[] = []
    globalThis.fetch = async (input: string | URL | Request) => {
      asked.push(String(input))
      return new Response('gone', { status: 404 })
    }
    const started = Date.now()
    await assert.rejects(
      myfetchtextWithRetry('https://hgdownload.soe.ucsc.edu/hubs/gone/hub.txt'),
      (error: unknown) => error instanceof HttpError && error.status === 404,
    )
    assert.equal(asked.length, 2)
    assert.ok(Date.now() - started < 1000)
  })

  it('keeps retrying a 5xx, which is upstream having a bad day', async () => {
    const asked: string[] = []
    globalThis.fetch = async (input: string | URL | Request) => {
      asked.push(String(input))
      return new Response('busy', { status: 503 })
    }
    await assert.rejects(
      myfetchtextWithRetry('https://hgdownload.soe.ucsc.edu/hub.txt', 2),
    )
    assert.equal(asked.length, 4)
  })

  it('does not take a mirror 404 as proof while the primary is unreachable', async () => {
    // The mirror saying "gone" and the primary saying nothing at all is not the
    // same as both saying gone, so the round does not count as answered.
    const asked: string[] = []
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input)
      asked.push(url)
      if (url.includes('hgdownload2')) {
        return new Response('gone', { status: 404 })
      }
      throw new Error('connect ECONNREFUSED')
    }
    await assert.rejects(
      myfetchtextWithRetry('https://hgdownload.soe.ucsc.edu/hub.txt', 2),
    )
    assert.equal(asked.length, 4)
  })

  it('has no mirror for another host', async () => {
    const asked: string[] = []
    stubFetch(asked, () => 'list')
    await myfetchtextWithRetry('https://api.genome.ucsc.edu/list/ucscGenomes')
    assert.deepEqual(asked, ['https://api.genome.ucsc.edu/list/ucscGenomes'])
  })
})
