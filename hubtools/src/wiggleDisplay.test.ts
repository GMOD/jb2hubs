import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getUcscWiggleDisplay } from './wiggleDisplay.ts'

describe('getUcscWiggleDisplay', () => {
  it("draws gc5Base's mean over its 30:70 view limits", () => {
    assert.deepEqual(
      getUcscWiggleDisplay('hg38-gc5BaseBw', {
        windowingFunction: 'Mean',
        viewLimits: '30:70',
        autoScale: 'Off',
      }),
      {
        type: 'LinearWiggleDisplay',
        displayId: 'hg38-gc5BaseBw-LinearWiggleDisplay',
        encoding: {
          y: { field: 'score', scale: { domainMin: 30, domainMax: 70 } },
        },
      },
    )
  })

  it('maps each windowing function', () => {
    const summaryOf = (windowingFunction: string) => {
      const display = getUcscWiggleDisplay('t', { windowingFunction })
      return [display?.encoding.y.field, display?.mark?.extent]
    }
    assert.deepEqual(summaryOf('maximum'), ['maxScore', undefined])
    assert.deepEqual(summaryOf('minimum'), ['minScore', undefined])
    assert.deepEqual(summaryOf('mean+whiskers'), ['score', 'min-max'])
  })

  it('reads negative limits and applies them when autoScale is unset', () => {
    assert.deepEqual(getUcscWiggleDisplay('t', { viewLimits: '-4.5:8.8' }), {
      type: 'LinearWiggleDisplay',
      displayId: 't-LinearWiggleDisplay',
      encoding: { y: { scale: { domainMin: -4.5, domainMax: 8.8 } } },
    })
  })

  it('ignores view limits while UCSC autoscales', () => {
    assert.equal(
      getUcscWiggleDisplay('t', { viewLimits: '0:10', autoScale: 'on' }),
      undefined,
    )
    assert.equal(
      getUcscWiggleDisplay('t', { viewLimits: '0:10', autoScale: 'group' }),
      undefined,
    )
  })

  it('derives nothing from malformed or absent settings', () => {
    assert.equal(getUcscWiggleDisplay('t', { viewLimits: '10:0' }), undefined)
    assert.equal(getUcscWiggleDisplay('t', { viewLimits: 'x:1' }), undefined)
    assert.equal(
      getUcscWiggleDisplay('t', { windowingFunction: 'median' }),
      undefined,
    )
    assert.equal(getUcscWiggleDisplay('t', {}), undefined)
  })
})
