import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  axisFraction,
  buscoSegments,
  formatBp,
  geneSegments,
  n50Histogram,
  shareBelow,
  stack,
} from './assemblyGlance.ts'

describe('formatBp', () => {
  it('picks the largest unit and three significant figures', () => {
    assert.equal(formatBp(3_099_441_038), '3.10 Gb')
    assert.equal(formatBp(57_879_411), '57.9 Mb')
    assert.equal(formatBp(212_874), '213 kb')
    assert.equal(formatBp(5464), '5.46 kb')
    assert.equal(formatBp(850), '850 bp')
  })
})

describe('axisFraction', () => {
  it('is log-scaled and clamped to the axis', () => {
    assert.equal(axisFraction(1e3), 0)
    assert.equal(axisFraction(1e6), 0.5)
    assert.equal(axisFraction(1e9), 1)
    assert.equal(axisFraction(10), 0)
    assert.equal(axisFraction(1e12), 1)
    assert.equal(axisFraction(0), 0)
  })
})

describe('n50Histogram', () => {
  it('counts each value once, clamping the ends into the edge bins', () => {
    const bins = n50Histogram([1, 1e3, 1e6, 1e9, 1e12], 6)
    assert.deepEqual(bins, [2, 0, 0, 1, 0, 2])
  })
})

describe('shareBelow', () => {
  it('counts the values strictly below', () => {
    const sorted = [1, 2, 2, 3]
    assert.equal(shareBelow(sorted, 2), 0.25)
    assert.equal(shareBelow(sorted, 4), 1)
    assert.equal(shareBelow(sorted, 0), 0)
    assert.equal(shareBelow([], 1), undefined)
  })
})

describe('buscoSegments', () => {
  it('orders the parts as BUSCO plots them', () => {
    const segments = buscoSegments({
      complete: 0.989,
      single_copy: 0.979,
      duplicated: 0.009,
      fragmented: 0.005,
      missing: 0.007,
    })
    assert.deepEqual(
      segments?.map(s => s.key),
      ['single_copy', 'duplicated', 'fragmented', 'missing'],
    )
  })

  it('is absent without a completeness figure', () => {
    assert.equal(buscoSegments(undefined), undefined)
    assert.equal(buscoSegments({ single_copy: 0.9 }), undefined)
    assert.equal(buscoSegments({ complete: 0.9 }), undefined)
  })
})

describe('geneSegments', () => {
  it('draws only the kinds NCBI counted', () => {
    assert.deepEqual(
      geneSegments({ total: 4000, protein_coding: 3907, pseudogene: 12 })?.map(
        s => s.key,
      ),
      ['protein_coding', 'pseudogene'],
    )
    assert.equal(geneSegments({ total: 12 }), undefined)
    assert.equal(geneSegments(undefined), undefined)
  })
})

describe('stack', () => {
  it('splits the width in proportion, leaving a gap between neighbours', () => {
    const placed = stack(
      [
        { key: 'a', label: 'a', value: 3, color: '' },
        { key: 'b', label: 'b', value: 0, color: '' },
        { key: 'c', label: 'c', value: 1, color: '' },
      ],
      102,
    )
    assert.deepEqual(
      placed.map(({ key, x, width }) => [key, x, width]),
      [
        ['a', 0, 75],
        ['c', 77, 25],
      ],
    )
  })
})
