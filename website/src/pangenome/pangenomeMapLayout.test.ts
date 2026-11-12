import assert from 'node:assert'
import { test } from 'node:test'

import {
  labelled,
  packRows,
  placed,
  placement,
  rulerTicks,
  scale,
  spanStyle,
  tickStep,
} from './pangenomeMapLayout.ts'
import { sizedChange } from './pangenomeMarks.ts'

const region = { chrom: 'chr1', start: 1000, end: 2000 }

test('a tick step gives the ruler six ticks at most', () => {
  assert.equal(tickStep(4000), 1000)
  assert.equal(tickStep(90_000), 20_000)
  assert.equal(tickStep(150_000), 50_000)
  assert.equal(tickStep(5_000_000), 1_000_000)
})

test("the ruler's ticks are round, inside the window and clear of its label", () => {
  assert.deepEqual(
    rulerTicks({ chrom: 'chr6', start: 32_510_000, end: 32_600_000 }),
    { ticks: [32_520_000, 32_540_000, 32_560_000, 32_580_000], digits: 2 },
  )
  assert.deepEqual(
    rulerTicks({ chrom: 'chr1', start: 2_428_400, end: 2_430_300 }),
    { ticks: [2_429_000, 2_430_000], digits: 3 },
  )
})

test('a base outside the window is clamped to its edge', () => {
  const x = scale(region)
  assert.equal(x(500), 0)
  assert.equal(x(1500), 0.5)
  assert.equal(x(2500), 1)
})

test('overlapping genes go on rows of their own', () => {
  const gene = (symbol: string, start: number, end: number) => ({
    symbol,
    start,
    end,
  })
  const tnxb = gene('TNXB', 100, 900)
  const cyp = gene('CYP21A2', 200, 300)
  const c4 = gene('C4A', 950, 990)
  assert.deepEqual(packRows([cyp, c4, tnxb]), [[tnxb, c4], [cyp]])
  assert.deepEqual(packRows([]), [])
})

test('a span past the window is cut, and says which end', () => {
  assert.deepEqual(placed(region, 900, 1200), {
    left: 0,
    width: 0.2,
    clipLeft: true,
    clipRight: false,
  })
  assert.deepEqual(spanStyle(placed(region, 1250, 1750)), {
    left: '25%',
    width: '50%',
  })
})

test('a deletion is drawn at its own length, centred in its site', () => {
  const p = placement(
    sizedChange('deletion', { site: 0, start: 1000, end: 2000 }, -500),
    region,
  )
  assert.deepEqual([p.left, p.width], [0.25, 0.5])
  const point = placement(
    sizedChange('insertion', { site: 0, start: 1400, end: 1400 }, 6000),
    region,
  )
  assert.deepEqual([point.left, point.width], [0.4, 0])
})

test('a block shows its size only where no other block covers the label', () => {
  assert.deepEqual(
    labelled([
      { left: 0.1, width: 0.5 },
      { left: 0.12, width: 0 },
      { left: 0.3, width: 0.02 },
      { left: 0.7, width: 0.2 },
      { left: 0.92, width: 0.05 },
    ]),
    [false, false, false, true, false],
  )
  assert.deepEqual(
    labelled([
      { left: 0.1, width: 0.5 },
      { left: 0.3, width: 0 },
    ]),
    [true, false],
  )
})
