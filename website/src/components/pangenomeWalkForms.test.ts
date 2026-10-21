import assert from 'node:assert'
import { test } from 'node:test'

import { structuralForms } from '@jbrowse/graph-walks'

import { headline, structuralPanel } from './pangenomePanels.ts'
import { walkFormsResult } from './pangenomeWalkForms.ts'

import type { Departure, HaplotypeDepartures } from '@jbrowse/graph-walks'

const WINDOW = { start: 0, end: 20_000 }

const haplotype = (
  name: string,
  departures: Departure[] = [],
): HaplotypeDepartures => ({
  haplotype: name,
  covered: [[WINDOW.start, WINDOW.end]],
  departures,
  open: false,
})

const change = (
  refStart: number,
  refEnd: number,
  altLength: number,
): Departure => ({
  refStart,
  refEnd,
  altLength,
  invertedBp: 0,
  repeatedBp: 0,
})

function windowOf(haplotypes: HaplotypeDepartures[]) {
  return walkFormsResult(
    structuralForms(haplotypes, { window: WINDOW, floorBp: 50 }),
  )
}

// GSTM1: an 18 kb deletion on most haplotypes, the reference on the rest
test('walk forms read as the sidecar shape: a deletion and the reference', () => {
  const result = windowOf([
    ...Array.from({ length: 12 }, (_, i) =>
      haplotype(`D${i}#1`, [change(1000, 7000, 0)]),
    ),
    ...Array.from({ length: 8 }, (_, i) => haplotype(`R${i}#1`)),
  ])
  assert.deepEqual(
    result.forms.map(f => [f.members.length, f.marks.map(m => m.kind)]),
    [
      [12, ['deletion']],
      [8, []],
    ],
  )
  assert.deepEqual(result.forms[0]!.deltas, [-6000])
  assert.equal(result.informativeSites.length, 1)
  assert.equal(result.informativeSites[0]!.aligned, 20)
  assert.equal(result.unplaced.length, 0)
})

// AMY1: a copy deleted at one end and inserted at the other keeps the length
test('a shifted copy reads beside the reference in the headline', () => {
  const panel = structuralPanel(
    windowOf([
      ...Array.from({ length: 10 }, (_, i) =>
        haplotype(`S${i}#1`, [change(1000, 4000, 0), change(9000, 9000, 3000)]),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        haplotype(`D${i}#1`, [change(1000, 4000, 0)]),
      ),
      ...Array.from({ length: 4 }, (_, i) => haplotype(`R${i}#1`)),
    ]),
  )!
  assert.equal(panel.shiftedOnly, 10)
  assert.equal(panel.reference, 4)
  assert.match(
    headline(panel, 'GRCh38'),
    /GRCh38's structure: 20%, and its length with a stretch aligned elsewhere: 50%\.$/,
  )
})

test('a haplotype with no walk in the window is unplaced', () => {
  const result = windowOf([
    ...Array.from({ length: 10 }, (_, i) =>
      haplotype(`D${i}#1`, [change(1000, 7000, 0)]),
    ),
    ...Array.from({ length: 9 }, (_, i) => haplotype(`R${i}#1`)),
    { haplotype: 'X#1', covered: [], departures: [], open: false },
  ])
  assert.deepEqual(result.unplaced, ['X#1'])
})
