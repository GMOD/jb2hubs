import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { trixLine, xenoSymbolIndexLines } from './xenoSymbolIndex.ts'

const trackId = 'GCA_036365475.1-xenoRefGene'
const symbols = new Map([
  ['NM_001368919', 'PAX6'],
  ['NM_013627', 'Pax6'],
  ['NM_131304', 'pax6a'],
  ['NM_001127', 'pax6'],
  ['NM_000546', 'TP53'],
])
const row = (
  refName: string,
  start: number,
  end: number,
  accession: string,
) => ({
  refName,
  start,
  end,
  accession,
})

describe('trixLine', () => {
  it('writes the jbrowse text-index record, fields URI-encoded', () => {
    assert.equal(
      trixLine('CM071016.1:1..10', trackId, ['zgc:101564', 'NM_1.1']),
      `["CM071016.1%3A1..10"|"${trackId}"|"zgc%3A101564"|"NM_1.1"] zgc:101564 NM_1.1\n`,
    )
  })
})

describe('xenoSymbolIndexLines', () => {
  it('merges overlapping hits of one symbol, labelled by the upper-case spelling', () => {
    const lines = xenoSymbolIndexLines(
      [
        row('chr1', 100, 500, 'NM_013627.4'),
        row('chr1', 400, 900, 'NM_001368919.2'),
        row('chr1', 850, 1000, 'NM_001127.1'),
      ],
      symbols,
      trackId,
    )
    assert.deepEqual(lines, [
      trixLine(
        'chr1:101..1000',
        trackId,
        [
          'PAX6',
          'Pax6',
          'pax6',
          'NM_013627.4',
          'NM_001368919.2',
          'NM_001127.1',
        ],
        ['PAX6'],
      ),
    ])
  })

  it('keeps apart touching hits, other sequences and other symbols', () => {
    const lines = xenoSymbolIndexLines(
      [
        row('chr1', 100, 500, 'NM_013627.4'),
        row('chr1', 500, 600, 'NM_013627.4'),
        row('chr2', 100, 500, 'NM_013627.4'),
        row('chr1', 100, 500, 'NM_131304.1'),
      ],
      symbols,
      trackId,
    )
    assert.deepEqual(
      lines.map(l => l.split(' ')[0]!.split('|')[0]),
      [
        '["chr1%3A101..500"',
        '["chr1%3A501..600"',
        '["chr2%3A101..500"',
        '["chr1%3A101..500"',
      ],
    )
  })

  it('indexes symbols only, and drops an accession with none', () => {
    const lines = xenoSymbolIndexLines(
      [row('chr1', 0, 10, 'NM_000546.6'), row('chr1', 0, 10, 'NM_999999.1')],
      symbols,
      trackId,
    )
    assert.equal(lines.length, 1)
    assert.match(lines[0]!, /\] TP53\n$/)
  })
})
