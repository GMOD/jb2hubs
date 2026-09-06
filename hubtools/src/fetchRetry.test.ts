import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { myfetchtextWithRetry } from './util.ts'

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

  it('has no mirror for another host', async () => {
    const asked: string[] = []
    stubFetch(asked, () => 'list')
    await myfetchtextWithRetry('https://api.genome.ucsc.edu/list/ucscGenomes')
    assert.deepEqual(asked, ['https://api.genome.ucsc.edu/list/ucscGenomes'])
  })
})
