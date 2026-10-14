import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createHtmlLink, extractParentTracks } from './trackUtils.ts'

import type { TrackDbFile } from '@gmod/ucsc-hub'

const trackDbUrl = 'https://example.com/hub/hg38/trackDb.txt'

describe('createHtmlLink', () => {
  it('resolves against the trackDb', () => {
    assert.equal(
      createHtmlLink('html/mane.html', trackDbUrl),
      '<a href="https://example.com/hub/hg38/html/mane.html">html/mane.html</a>',
    )
  })

  it('cannot break out of the attribute or the tag', () => {
    const link = createHtmlLink('x" onerror="alert(1)', trackDbUrl)
    assert.ok(!link.includes('onerror="'))
    assert.ok(link.includes('&quot;'))
  })
})

describe('extractParentTracks', () => {
  const db = (parents: Record<string, string | undefined>) =>
    ({
      data: Object.fromEntries(
        Object.entries(parents).map(([track, parent]) => [
          track,
          { data: { track, ...(parent ? { parent } : {}) } },
        ]),
      ),
    }) as unknown as TrackDbFile

  it('lists ancestors outermost first, ignoring the on/off flag', () => {
    const names = extractParentTracks(
      'c',
      db({ a: undefined, b: 'a', c: 'b off' }),
    ).map(s => s.data.track)
    assert.deepEqual(names, ['a', 'b'])
  })

  it('stops at a cycle or a parent the hub lacks', () => {
    assert.deepEqual(
      extractParentTracks('a', db({ a: 'b', b: 'a' })).map(s => s.data.track),
      ['b'],
    )
    assert.deepEqual(extractParentTracks('a', db({ a: 'gone' })), [])
  })

  it('reads `subTrack` as `parent`', () => {
    const trackDb = {
      data: {
        view: { data: { track: 'view', subTrack: 'composite' } },
        composite: { data: { track: 'composite' } },
        leaf: { data: { track: 'leaf', subTrack: 'view' } },
      },
    } as unknown as TrackDbFile
    assert.deepEqual(
      extractParentTracks('leaf', trackDb).map(s => s.data.track),
      ['composite', 'view'],
    )
  })
})
