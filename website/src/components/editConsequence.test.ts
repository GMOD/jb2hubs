import assert from 'node:assert'
import { test } from 'node:test'

import { editConsequence, editLine, editOpens } from './editConsequence.ts'

import type { Transcript } from './geneStructure.ts'

// Three coding exons of 60, 90 and 300 nt: 150 residues, the last junction at
// coding offset 150 (residue 51).
const plus: Transcript = {
  refName: 'chr1',
  strand: 1,
  name: 'NM_1',
  geneName: 'T',
  cds: [
    { start: 1000, end: 1060, phase: 0 },
    { start: 2000, end: 2090, phase: 0 },
    { start: 3000, end: 3300, phase: 0 },
  ],
}

// The same exons on the minus strand: genomic ascending, translated last first.
const minus: Transcript = {
  ...plus,
  strand: -1,
  cds: [
    { start: 1000, end: 1300, phase: 0 },
    { start: 2000, end: 2090, phase: 0 },
    { start: 3000, end: 3060, phase: 0 },
  ],
}

test('editConsequence: a stop far before the last junction is an NMD target', () => {
  for (const t of [plus, minus]) {
    const c = editConsequence(t, 150, 10, 'stop')
    assert.deepEqual(c, {
      kind: 'stop',
      exon: 1,
      exons: 3,
      toLastJunction: 123,
      nmd: 'likely',
      made: 9,
      lost: [{ start: 10, end: 150 }],
    })
  }
})

test('editConsequence: inside the 50 nt window, or in the last exon, a truncated protein is made', () => {
  const near = editConsequence(plus, 150, 40, 'stop')
  assert.equal(near?.kind === 'stop' && near.toLastJunction, 33)
  assert.equal(near?.kind === 'stop' && near.nmd, 'unlikely')
  const edge = editConsequence(plus, 150, 34, 'stop')
  assert.equal(edge?.kind === 'stop' && edge.toLastJunction, 51)
  assert.equal(edge?.kind === 'stop' && edge.nmd, 'borderline')
  const last = editConsequence(minus, 150, 100, 'stop')
  assert.deepEqual(last, {
    kind: 'stop',
    exon: 3,
    exons: 3,
    toLastJunction: undefined,
    nmd: 'unlikely',
    made: 99,
    lost: [{ start: 100, end: 150 }],
  })
})

test('editConsequence: skipping an internal exon deletes in frame or shifts the frame', () => {
  for (const t of [plus, minus]) {
    assert.deepEqual(editConsequence(t, 150, 30, 'skip'), {
      kind: 'skip',
      exon: 2,
      exons: 3,
      codingLength: 90,
      inFrame: true,
      lost: [{ start: 21, end: 50 }],
    })
  }
  const shifted: Transcript = {
    ...plus,
    cds: [
      { start: 1000, end: 1060, phase: 0 },
      { start: 2000, end: 2091, phase: 0 },
      { start: 3000, end: 3299, phase: 0 },
    ],
  }
  assert.deepEqual(editConsequence(shifted, 150, 30, 'skip'), {
    kind: 'skip',
    exon: 2,
    exons: 3,
    codingLength: 91,
    inFrame: false,
    lost: [{ start: 21, end: 150 }],
  })
  // the first and last coding exons carry the start and the stop
  assert.equal(editConsequence(plus, 150, 10, 'skip'), undefined)
  assert.equal(editConsequence(plus, 150, 100, 'skip'), undefined)
  assert.equal(editConsequence(plus, 150, 151, 'stop'), undefined)
})

test('editLine and editOpens: the fold line and what the button opens on', () => {
  const regions = [
    { kind: 'domain' as const, name: 'Tetramerisation', start: 120, end: 150 },
    { kind: 'domain' as const, name: 'Core', start: 10, end: 100 },
  ]
  const stop = editConsequence(plus, 150, 100, 'stop')!
  assert.equal(
    editLine(stop, 'R100*', regions),
    'A stop at R100* is in the last coding exon (3 of 3), so the transcript escapes nonsense-mediated decay and a protein of 99 residues is made, missing 100–150, including the Tetramerisation and Core.',
  )
  assert.equal(
    editOpens(stop, 'R100*'),
    'the 51 residues a stop at R100* removes',
  )
  const nmd = editConsequence(plus, 150, 10, 'stop')!
  assert.equal(
    editLine(nmd, 'W10*'),
    'A stop at W10* is in coding exon 1 of 3, 123 nt before the last junction, so the transcript is a likely target for nonsense-mediated decay.',
  )
  const skip = editConsequence(plus, 150, 30, 'skip')!
  assert.equal(
    editLine(skip, 'G30', regions),
    'Skipping coding exon 2 of 3 (90 nt, in frame) deletes residues 21–50, including the Core.',
  )
  assert.equal(
    editOpens(skip, 'G30'),
    'residues 21–50, deleted by skipping exon 2',
  )
})
