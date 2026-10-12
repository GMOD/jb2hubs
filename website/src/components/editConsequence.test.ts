import assert from 'node:assert'
import { test } from 'node:test'

import { editConsequence, editLine, editOpens } from './editConsequence.ts'

import type { Transcript } from './geneStructure.ts'

// Coding exons of 300, 450, 90 and 300 nt: 380 residues, exon 2 past the
// 407 nt long-exon rule, the last junction at coding offset 840 (residue 281).
const plus: Transcript = {
  refName: 'chr1',
  strand: 1,
  name: 'NM_1',
  geneName: 'T',
  cds: [
    { start: 1000, end: 1300, phase: 0 },
    { start: 2000, end: 2450, phase: 0 },
    { start: 3000, end: 3090, phase: 0 },
    { start: 4000, end: 4300, phase: 0 },
  ],
}

// The same exons on the minus strand: genomic ascending, translated last first.
const minus: Transcript = {
  ...plus,
  strand: -1,
  cds: [
    { start: 1000, end: 1300, phase: 0 },
    { start: 2000, end: 2090, phase: 0 },
    { start: 3000, end: 3450, phase: 0 },
    { start: 4000, end: 4300, phase: 0 },
  ],
}

const stopAt = (t: Transcript, position: number) => {
  const c = editConsequence(t, 380, position, 'stop')
  assert.ok(c?.kind === 'stop')
  return c
}

test('editConsequence: a stop past the escape rules is an NMD target', () => {
  for (const t of [plus, minus]) {
    assert.deepEqual(stopAt(t, 60), {
      kind: 'stop',
      exon: 1,
      exons: 4,
      toLastJunction: 663,
      fromStart: 177,
      exonLength: 300,
      nmd: 'nmd',
      made: 59,
      lost: [{ start: 60, end: 380 }],
    })
    assert.equal(stopAt(t, 260).nmd, 'nmd')
  }
})

test('editConsequence: the four escape rules, last exon first', () => {
  assert.equal(stopAt(plus, 300).nmd, 'last')
  assert.equal(stopAt(minus, 300).toLastJunction, undefined)
  // 33 nt before the last junction
  assert.equal(stopAt(plus, 270).nmd, 'penultimate')
  // 27 nt into the coding sequence
  assert.equal(stopAt(plus, 10).nmd, 'start')
  assert.equal(stopAt(plus, 51).nmd, 'nmd')
  // in the 450 nt exon
  assert.equal(stopAt(plus, 150).nmd, 'long-exon')
})

test('editConsequence: skipping an internal exon deletes in frame or shifts the frame', () => {
  assert.deepEqual(editConsequence(plus, 380, 270, 'skip'), {
    kind: 'skip',
    exon: 3,
    exons: 4,
    codingLength: 90,
    inFrame: true,
    onCodonBoundary: true,
    lost: [{ start: 251, end: 280 }],
  })
  const shifted: Transcript = {
    ...plus,
    cds: [
      { start: 1000, end: 1300, phase: 0 },
      { start: 2000, end: 2450, phase: 0 },
      { start: 3000, end: 3091, phase: 0 },
      { start: 4000, end: 4299, phase: 0 },
    ],
  }
  const frameshift = editConsequence(shifted, 380, 270, 'skip')
  assert.equal(frameshift?.kind === 'skip' && frameshift.inFrame, false)
  assert.deepEqual(frameshift?.lost, [{ start: 251, end: 380 }])
  // the first and last coding exons carry the start and the stop
  assert.equal(editConsequence(plus, 380, 10, 'skip'), undefined)
  assert.equal(editConsequence(plus, 380, 300, 'skip'), undefined)
  assert.equal(editConsequence(plus, 380, 381, 'stop'), undefined)
})

test('editConsequence: an exon starting inside a codon fuses the codons at its ends', () => {
  // exon 3 starts at coding offset 751, the middle of codon 251, and ends
  // inside codon 281: skipping it leaves one codon from the two halves
  const offset: Transcript = {
    ...plus,
    cds: [
      { start: 1000, end: 1300, phase: 0 },
      { start: 2000, end: 2451, phase: 0 },
      { start: 3000, end: 3090, phase: 2 },
      { start: 4000, end: 4299, phase: 1 },
    ],
  }
  const c = editConsequence(offset, 380, 270, 'skip')!
  assert.deepEqual(c.lost, [{ start: 251, end: 281 }])
  assert.equal(
    editLine(c, 'G270'),
    'Skipping coding exon 3 of 4 (90 nt, in frame) fuses residues 251–281 into one.',
  )
})

test('editLine and editOpens: the fold line and what the button opens on', () => {
  const regions = [
    { kind: 'domain' as const, name: 'Tetramerisation', start: 320, end: 380 },
    { kind: 'domain' as const, name: 'Core', start: 100, end: 290 },
  ]
  const last = stopAt(plus, 300)
  assert.equal(
    editLine(last, 'R300*', regions),
    'A stop at R300* is in the last coding exon (4 of 4), so the transcript escapes nonsense-mediated decay and a protein of 299 residues is made, missing 300–380, including the Tetramerisation.',
  )
  assert.equal(
    editOpens(last, 'R300*'),
    'the 81 residues a stop at R300* removes',
  )
  assert.equal(
    editLine(stopAt(plus, 60), 'W60*'),
    'A stop at W60* is in coding exon 1 of 4, 663 nt before the last exon junction, so the transcript is a likely target for nonsense-mediated decay.',
  )
  assert.equal(
    editLine(stopAt(plus, 10), 'W10*'),
    'A stop at W10* is 27 nt into the coding sequence, inside the first 150 nt, where ribosomes can restart at a later start codon and the transcript often escapes nonsense-mediated decay.',
  )
  const skip = editConsequence(plus, 380, 270, 'skip')!
  assert.equal(
    editLine(skip, 'G270', regions),
    'Skipping coding exon 3 of 4 (90 nt, in frame) deletes residues 251–280, including the Core.',
  )
  assert.equal(
    editOpens(skip, 'G270'),
    'residues 251–280, deleted by skipping exon 3',
  )
})

test('editLine: the lost residues are named in the map numbering, and left out where they do not carry', () => {
  const regions = [
    { kind: 'domain' as const, name: 'Core', start: 100, end: 290 },
  ]
  // a canonical 24 residues longer at the N-terminus than the translation
  const shifted = { ...stopAt(plus, 300), shown: [{ start: 324, end: 404 }] }
  assert.equal(
    editLine(shifted, 'R324*', regions),
    'A stop at R324* is in the last coding exon (4 of 4), so the transcript escapes nonsense-mediated decay and a protein of 299 residues is made, missing 324–404.',
  )
  const uncarried = { ...stopAt(plus, 300), shown: [] }
  assert.equal(
    editLine(uncarried, 'R300*', regions),
    'A stop at R300* is in the last coding exon (4 of 4), so the transcript escapes nonsense-mediated decay and a protein of 299 residues is made.',
  )
  const skip = { ...editConsequence(plus, 380, 270, 'skip')!, shown: [] }
  assert.equal(editOpens(skip, 'G270'), 'the residues skipping exon 3 changes')
})
