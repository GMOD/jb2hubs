import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  COLOR_DERIVED_PATHS,
  WIGGLE_DERIVED_PATHS,
  withDerivedDisplay,
} from './derivedDisplay.ts'

import type { Track } from './types.ts'

const displayId = 't-LinearWiggleDisplay'
const color = {
  type: 'LinearWiggleDisplay',
  displayId,
  encoding: { color: { value: 'darkgreen' } },
}
const y = {
  type: 'LinearWiggleDisplay',
  displayId,
  encoding: { y: { field: 'score', scale: { domainMin: 30, domainMax: 70 } } },
}
const track: Track = {
  trackId: 't',
  type: 'QuantitativeTrack',
  displays: [{ type: 'LinearWiggleDisplay', displayId, height: 80 }],
}

describe('withDerivedDisplay', () => {
  it('lets the color and y derivers share one encoding, in either order', () => {
    const expected = [
      {
        type: 'LinearWiggleDisplay',
        displayId,
        height: 80,
        encoding: { ...color.encoding, ...y.encoding },
      },
    ]
    const colorFirst = withDerivedDisplay(
      withDerivedDisplay(track, color, COLOR_DERIVED_PATHS),
      y,
      WIGGLE_DERIVED_PATHS,
    )
    const yFirst = withDerivedDisplay(
      withDerivedDisplay(track, y, WIGGLE_DERIVED_PATHS),
      color,
      COLOR_DERIVED_PATHS,
    )
    assert.deepEqual(colorFirst.displays, expected)
    assert.deepEqual(yFirst.displays, expected)
  })

  it("re-runs each deriver over the other's output without dropping it", () => {
    const both = withDerivedDisplay(
      withDerivedDisplay(track, color, COLOR_DERIVED_PATHS),
      y,
      WIGGLE_DERIVED_PATHS,
    )
    const rerun = withDerivedDisplay(
      withDerivedDisplay(both, y, WIGGLE_DERIVED_PATHS),
      color,
      COLOR_DERIVED_PATHS,
    )
    assert.deepEqual(rerun.displays, both.displays)
  })

  it('drops an encoding left empty once its owned members go', () => {
    const whiskers = {
      type: 'LinearWiggleDisplay',
      displayId,
      extent: 'min-max',
    }
    const rerun = withDerivedDisplay(
      { ...track, displays: [{ ...y, encoding: { y: { field: 'score' } } }] },
      whiskers,
      WIGGLE_DERIVED_PATHS,
    )
    assert.deepEqual(rerun.displays, [whiskers])
  })
})
