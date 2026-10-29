import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { withoutV5OnlyDisplays } from './v5OnlyDisplays.ts'

describe('withoutV5OnlyDisplays', () => {
  it('keeps the displays v4.3.0 has', () => {
    const { tracks } = withoutV5OnlyDisplays({
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
    const { tracks } = withoutV5OnlyDisplays({
      tracks: [
        { trackId: 'gwas', displays: [{ type: 'LinearManhattanDisplay' }] },
      ],
    })
    assert.deepEqual(tracks, [{ trackId: 'gwas' }])
  })

  it('leaves the config it was given alone', () => {
    const displays = [{ type: 'LinearMarkDisplay' }]
    withoutV5OnlyDisplays({ tracks: [{ trackId: 'alfa', displays }] })
    assert.equal(displays.length, 1)
  })
})
