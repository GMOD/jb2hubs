import assert from 'node:assert'
import { test } from 'node:test'

import {
  parseUniProtStructureMappings,
  segmentsForAccession,
  toAuthorRange,
} from 'p2s_mapper'

// The author numbering `ProteinLaunchCard` lights `initialResidues` by comes
// from p2s_mapper now, not from this repo. It is pinned here anyway: the card
// is wrong in a way nothing reports if the shift moves — the protein view opens
// on the wrong residue, and a wrong residue looks exactly like a right one.

// 2HHB as PDBe serves it: both haemoglobin chains number from the mature
// protein, one behind UniProt, and SIFTS names both endpoints.
const hhb = {
  '2hhb': {
    UniProt: {
      P68871: {
        mappings: [
          {
            entity_id: 2,
            chain_id: 'B',
            start: { author_residue_number: 1, residue_number: 1 },
            end: { author_residue_number: 146, residue_number: 146 },
            unp_start: 2,
            unp_end: 147,
          },
          {
            entity_id: 2,
            chain_id: 'D',
            start: { author_residue_number: 1, residue_number: 1 },
            end: { author_residue_number: 146, residue_number: 146 },
            unp_start: 2,
            unp_end: 147,
          },
        ],
      },
      P69905: {
        mappings: [
          {
            entity_id: 1,
            chain_id: 'A',
            start: { author_residue_number: 1, residue_number: 1 },
            end: { author_residue_number: 141, residue_number: 141 },
            unp_start: 2,
            unp_end: 142,
          },
        ],
      },
    },
  },
}

const hhbSegments = (accession: string) =>
  segmentsForAccession(parseUniProtStructureMappings(hhb), accession)

test('the named accession only', () => {
  assert.deepStrictEqual(
    hhbSegments('P68871').map(s => s.chainId),
    ['B', 'D'],
  )
  assert.deepStrictEqual(hhbSegments('Q00000'), [])
})

test('Glu7 of the translation is Glu6 in the crystal', () => {
  assert.deepStrictEqual(
    toAuthorRange(hhbSegments('P68871'), {
      start: 7,
      end: 7,
    }),
    {
      start: 6,
      end: 6,
      chain: 'B',
      shift: -1,
    },
  )
})

test('the range is clipped to the segment, and a miss is undefined', () => {
  assert.deepStrictEqual(
    toAuthorRange(hhbSegments('P68871'), {
      start: 1,
      end: 10,
    }),
    {
      start: 1,
      end: 9,
      chain: 'B',
      shift: -1,
    },
  )
  assert.strictEqual(
    toAuthorRange(hhbSegments('P68871'), { start: 150, end: 160 }),
    undefined,
  )
})

test('the segment covering most of the range decides', () => {
  const segments = [
    {
      entityId: '1',
      chainId: 'A',
      authorStart: 101,
      unpStart: 1,
      unpEnd: 50,
      structStart: 0,
      structEnd: 49,
    },
    {
      entityId: '1',
      chainId: 'A',
      authorStart: 201,
      unpStart: 51,
      unpEnd: 150,
      structStart: 50,
      structEnd: 149,
    },
  ]
  assert.deepStrictEqual(toAuthorRange(segments, { start: 40, end: 120 }), {
    start: 201,
    end: 270,
    chain: 'A',
    shift: 150,
  })
})

// A segment numbered at the start and null at the end, which is 12% of real
// mappings (343 of 2809, measured 2026-09-16 across the ten chip accessions).
// The implementation this replaced required both endpoints and discarded the
// segment; `toAuthorRange` needs only the start, because the shift comes from
// there and the end is derived. It matters where such a segment would have won
// on overlap — four EGFR entries — and not for 1TUP, whose shift is 0, so the
// card's `author ?? range` fallback already lit R248 correctly.
const tup = {
  '1tup': {
    UniProt: {
      P04637: {
        name: 'P53_HUMAN',
        mappings: [
          {
            entity_id: 3,
            chain_id: 'A',
            start: { author_residue_number: 94, residue_number: 1 },
            end: { author_residue_number: null, residue_number: 219 },
            unp_start: 94,
            unp_end: 312,
          },
          {
            entity_id: 3,
            chain_id: 'B',
            start: { author_residue_number: null, residue_number: 1 },
            end: { author_residue_number: null, residue_number: 219 },
            unp_start: 94,
            unp_end: 312,
          },
        ],
      },
    },
  },
}

test('a segment numbered at the start but not the end still answers', () => {
  const segments = segmentsForAccession(
    parseUniProtStructureMappings(tup),
    'P04637',
  )
  // 1TUP's p53 chain numbers as UniProt does, so R248 is author 248
  assert.deepStrictEqual(toAuthorRange(segments, { start: 248, end: 248 }), {
    start: 248,
    end: 248,
    chain: 'A',
    shift: 0,
  })
})

test('a segment numbered at neither end cannot answer', () => {
  const segments = segmentsForAccession(
    parseUniProtStructureMappings({
      '1abc': {
        UniProt: {
          P1: {
            mappings: [
              {
                entity_id: 1,
                chain_id: 'A',
                start: { author_residue_number: null, residue_number: 1 },
                end: { author_residue_number: null, residue_number: 10 },
                unp_start: 1,
                unp_end: 10,
              },
            ],
          },
        },
      },
    }),
    'P1',
  )
  assert.strictEqual(toAuthorRange(segments, { start: 1, end: 5 }), undefined)
})
