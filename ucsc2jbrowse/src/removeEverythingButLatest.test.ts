/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { findOutdatedTrackIds } from './removeEverythingButLatest.ts'

describe('findOutdatedTrackIds', () => {
  it('keeps the numerically-latest version, not the lexically-last', () => {
    const tracks = [
      { trackId: 'wgEncodeGencodeCompV5' },
      { trackId: 'wgEncodeGencodeCompV9' },
      { trackId: 'wgEncodeGencodeCompV10' },
      { trackId: 'wgEncodeGencodeCompV46' },
    ]
    const toRemove = findOutdatedTrackIds(tracks)
    assert.ok(!toRemove.has('wgEncodeGencodeCompV46'))
    assert.deepEqual([...toRemove].sort(), [
      'wgEncodeGencodeCompV10',
      'wgEncodeGencodeCompV5',
      'wgEncodeGencodeCompV9',
    ])
  })

  it('handles each prefix independently', () => {
    const tracks = [
      { trackId: 'wgEncodeGencodeCompV1' },
      { trackId: 'wgEncodeGencodeCompV2' },
      { trackId: 'wgEncodeGencodeBasicV3' },
      { trackId: 'wgEncodeGencodeBasicV12' },
    ]
    const toRemove = findOutdatedTrackIds(tracks)
    assert.deepEqual([...toRemove].sort(), [
      'wgEncodeGencodeBasicV3',
      'wgEncodeGencodeCompV1',
    ])
  })

  it('leaves unrelated and single-version tracks untouched', () => {
    const tracks = [
      { trackId: 'refGene' },
      { trackId: 'wgEncodeGencodeCompV44' },
      { trackId: 'cloneEndABC' },
    ]
    const toRemove = findOutdatedTrackIds(tracks)
    assert.equal(toRemove.size, 0)
  })
})
