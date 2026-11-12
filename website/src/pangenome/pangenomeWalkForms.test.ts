import assert from 'node:assert'
import { test } from 'node:test'

import {
  DepartureReadError,
  ExpansionTooLargeError,
  RegionTooLargeError,
  structuralForms,
} from '@jbrowse/graph-walks'

import { structuralPanel } from './pangenomePanels.ts'
import { headline } from './pangenomeProse.ts'
import {
  WalkFormsTooLarge,
  walkFormsError,
  walkFormsResult,
} from './pangenomeWalkForms.ts'

import type {
  Departure,
  FormsOptions,
  HaplotypeDepartures,
} from '@jbrowse/graph-walks'

const WINDOW = { start: 0, end: 20_000 }

const haplotype = (
  name: string,
  departures: Departure[] = [],
): HaplotypeDepartures => ({
  haplotype: name,
  covered: [[WINDOW.start, WINDOW.end]],
  departures,
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

const many = (n: number, prefix: string, departures: Departure[] = []) =>
  Array.from({ length: n }, (_, i) => haplotype(`${prefix}${i}#1`, departures))

function windowOf(
  haplotypes: HaplotypeDepartures[],
  options: FormsOptions = {},
) {
  return walkFormsResult(
    structuralForms(haplotypes, { window: WINDOW, floorBp: 50, ...options }),
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
    /20% of haplotypes here have GRCh38's structure, and 50% have its length with a stretch aligned elsewhere\.$/,
  )
})

test('a haplotype with no walk in the window is unplaced', () => {
  const result = windowOf([
    ...Array.from({ length: 10 }, (_, i) =>
      haplotype(`D${i}#1`, [change(1000, 7000, 0)]),
    ),
    ...Array.from({ length: 9 }, (_, i) => haplotype(`R${i}#1`)),
    { haplotype: 'X#1', covered: [], departures: [] },
  ])
  assert.deepEqual(result.unplaced, ['X#1'])
})

// Two haplotypes make both common changes, which no common form holds together
test("the walks' other form gets no lane and is not the reference's structure", () => {
  const result = windowOf(
    [
      ...many(10, 'D', [change(1000, 7000, 0)]),
      ...many(8, 'I', [change(12_000, 12_000, 3000)]),
      ...many(5, 'R'),
      ...many(2, 'X', [change(1000, 7000, 0), change(12_000, 12_000, 3000)]),
    ],
    { minCarriers: 3 },
  )
  const other = result.forms.find(f => f.other)
  assert.ok(other)
  assert.deepEqual(other.members, ['X0#1', 'X1#1'])
  assert.deepEqual(other.marks, [])
  const panel = structuralPanel(result, { completeSize: 10 })!
  assert.equal(panel.forms, 3)
  assert.deepEqual(
    panel.lanes.map(l => [l.shares, l.label]),
    [
      [10, '6 kb deletion'],
      [8, '3 kb insertion'],
      [5, ''],
    ],
  )
  assert.equal(panel.reference, 5)
  assert.equal(panel.placed, 25)
})

// Three haplotypes each insert a size no other carries, inside the common
// deletion's span
test('changes too rare to stand alone that agree with no common state read as rarer', () => {
  const result = windowOf(
    [
      ...many(10, 'D', [change(1000, 7000, 0)]),
      ...many(8, 'R'),
      haplotype('Q0#1', [change(3000, 3000, 300)]),
      haplotype('Q1#1', [change(3000, 3000, 3000)]),
      haplotype('Q2#1', [change(3000, 3000, 9000)]),
    ],
    { minCarriers: 3 },
  )
  const rarer = result.forms.find(f => f.rarer > 0)
  assert.ok(rarer)
  assert.deepEqual(rarer.members, ['Q0#1', 'Q1#1', 'Q2#1'])
  assert.deepEqual(
    rarer.marks.map(m => m.kind),
    ['rarer'],
  )
  assert.deepEqual(result.rareCarriers, ['Q0#1', 'Q1#1', 'Q2#1'])
  assert.deepEqual(
    structuralPanel(result)!.lanes.map(l => l.shares),
    [10, 8],
  )
})

// One site over 1 kb, two 2 kb deletions at different places in it
test('one size deleted at two places in a site is two changes', () => {
  const panel = structuralPanel(
    windowOf([
      ...many(10, 'A', [change(1000, 3000, 0)]),
      ...many(8, 'B', [change(2500, 4500, 0)]),
      ...many(6, 'R'),
    ]),
  )!
  assert.equal(panel.siteSpans.length, 1)
  assert.deepEqual(
    panel.changes.map(c => [c.mark.start, c.carriers]),
    [
      [1000, 10],
      [2500, 8],
    ],
  )
})

test("a read past graph-walks' budgets falls back to the callset, and nothing else does", () => {
  const expansion = new ExpansionTooLargeError(11_000_000, 8_000_000, 150_000)
  const bytes = new RegionTooLargeError('Zoom in', 8_000_000, 150_000, 1000)
  const departures = new DepartureReadError(3_000_000, 2_000_000)
  for (const e of [expansion, bytes, departures]) {
    assert.ok(walkFormsError(e) instanceof WalkFormsTooLarge)
  }
  assert.throws(() => {
    throw walkFormsError(expansion)
  }, /11,000,000 steps/)
  const unreadable = new Error('HTTP 403')
  assert.equal(walkFormsError(unreadable), unreadable)
})
