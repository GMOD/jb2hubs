import assert from 'node:assert'
import { test } from 'node:test'

import { parseSiftsSegments, toAuthorRange } from './siftsNumbering.ts'

// 2HHB as PDBe serves it: both haemoglobin chains number from the mature
// protein, one behind UniProt.
const hhb = {
  '2hhb': {
    UniProt: {
      P68871: {
        mappings: [
          {
            chain_id: 'B',
            start: { author_residue_number: 1 },
            end: { author_residue_number: 146 },
            unp_start: 2,
            unp_end: 147,
          },
          {
            chain_id: 'D',
            start: { author_residue_number: 1 },
            end: { author_residue_number: 146 },
            unp_start: 2,
            unp_end: 147,
          },
        ],
      },
      P69905: {
        mappings: [
          {
            chain_id: 'A',
            start: { author_residue_number: 1 },
            end: { author_residue_number: 141 },
            unp_start: 2,
            unp_end: 142,
          },
        ],
      },
    },
  },
}

test('parseSiftsSegments: the named accession only, id case-insensitive', () => {
  const segs = parseSiftsSegments(hhb, '2HHB', 'P68871')
  assert.deepStrictEqual(
    segs.map(s => s.chain),
    ['B', 'D'],
  )
  assert.deepStrictEqual(parseSiftsSegments(hhb, '2hhb', 'Q00000'), [])
})

test('parseSiftsSegments: a segment without author numbers is left out', () => {
  const segs = parseSiftsSegments(
    {
      '1abc': {
        UniProt: {
          P1: {
            mappings: [
              {
                chain_id: 'A',
                start: { author_residue_number: null },
                end: { author_residue_number: 10 },
                unp_start: 1,
                unp_end: 10,
              },
            ],
          },
        },
      },
    },
    '1abc',
    'P1',
  )
  assert.deepStrictEqual(segs, [])
})

test('toAuthorRange: Glu7 of the translation is Glu6 in the crystal', () => {
  const segs = parseSiftsSegments(hhb, '2hhb', 'P68871')
  assert.deepStrictEqual(toAuthorRange(segs, { start: 7, end: 7 }), {
    start: 6,
    end: 6,
    chain: 'B',
    shift: -1,
  })
})

test('toAuthorRange: the range is clipped to the segment, and a miss is undefined', () => {
  const segs = parseSiftsSegments(hhb, '2hhb', 'P68871')
  assert.deepStrictEqual(toAuthorRange(segs, { start: 1, end: 10 }), {
    start: 1,
    end: 9,
    chain: 'B',
    shift: -1,
  })
  assert.strictEqual(toAuthorRange(segs, { start: 150, end: 160 }), undefined)
})

test('toAuthorRange: the segment covering most of the range decides', () => {
  const segs = [
    { chain: 'A', authorStart: 101, authorEnd: 150, unpStart: 1, unpEnd: 50 },
    { chain: 'A', authorStart: 201, authorEnd: 300, unpStart: 51, unpEnd: 150 },
  ]
  assert.deepStrictEqual(toAuthorRange(segs, { start: 40, end: 120 }), {
    start: 201,
    end: 270,
    chain: 'A',
    shift: 150,
  })
})
