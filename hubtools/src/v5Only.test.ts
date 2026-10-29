import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { withoutV5Only } from './v5Only.ts'

describe('withoutV5Only', () => {
  it('keeps the displays v4.3.0 has', () => {
    const { tracks } = withoutV5Only({
      tracks: [
        {
          trackId: 'rmsk',
          displays: [
            { type: 'LinearBasicDisplay', displayId: 'a' },
            { type: 'LinearMultiRowFeatureDisplay', displayId: 'b' },
          ],
        },
      ],
    })
    assert.deepEqual(tracks, [
      {
        trackId: 'rmsk',
        displays: [{ type: 'LinearBasicDisplay', displayId: 'a' }],
      },
    ])
  })

  // the host then picks the track type's default display
  it('drops the key when no display is left', () => {
    const { tracks } = withoutV5Only({
      tracks: [
        { trackId: 'gwas', displays: [{ type: 'LinearManhattanDisplay' }] },
      ],
    })
    assert.deepEqual(tracks, [{ trackId: 'gwas' }])
  })

  // the multi-way star: v4.3.0 has no such adapter, and no display saves it
  it('drops a track whose adapter v4.3.0 lacks, nested or not', () => {
    const { tracks } = withoutV5Only({
      tracks: [
        {
          trackId: 'star',
          adapter: {
            type: 'MultiPairwiseSyntenyAdapter',
            adapters: [{ type: 'PairwiseIndexedPAFAdapter' }],
          },
        },
        {
          trackId: 'wrapped',
          adapter: {
            type: 'SomeWrapperAdapter',
            subadapter: { type: 'MultiPairwiseSyntenyAdapter' },
          },
        },
        { trackId: 'pair', adapter: { type: 'PairwiseIndexedPAFAdapter' } },
      ],
    })
    assert.deepEqual(
      tracks?.map(t => t.trackId),
      ['pair'],
    )
  })

  it('leaves the config it was given alone', () => {
    const displays = [{ type: 'LinearMarkDisplay' }]
    withoutV5Only({ tracks: [{ trackId: 'alfa', displays }] })
    assert.equal(displays.length, 1)
  })
})
