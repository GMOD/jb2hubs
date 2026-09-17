import assert from 'node:assert'
import { test } from 'node:test'

import { choosePanel, splitGenotype } from './pangenomePanels.ts'

const hap = (haplotype: string, ...alleles: (number | undefined)[]) => ({
  haplotype,
  alleles,
})

test('a panel is one lane per configuration, most common first', () => {
  const panel = choosePanel(
    [
      hap('HG00001#1', 0, 0),
      hap('HG00001#2', 0, 0),
      hap('HG00002#1', 0, 0),
      hap('HG00002#2', 1, 0),
      hap('HG00003#1', 1, 0),
      hap('HG00003#2', 0, 2),
    ],
    8,
  )!
  assert.equal(panel.sites, 2)
  assert.equal(panel.haplotypes, 6)
  assert.equal(panel.configurations, 3)
  assert.deepEqual(panel.lanes, [
    { haplotype: 'HG00001#1', shares: 3, nonReference: 0 },
    { haplotype: 'HG00002#2', shares: 2, nonReference: 1 },
    { haplotype: 'HG00003#2', shares: 1, nonReference: 1 },
  ])
})

test('the panel size caps the lanes, and a tie goes to the least similar configuration', () => {
  // Four singletons; after the reference-like one, the next lane should be the
  // one farthest from it (three differences), not the alphabetically first.
  const panel = choosePanel(
    [
      hap('HG00001#1', 0, 0, 0),
      hap('HG00002#1', 1, 0, 0),
      hap('HG00003#1', 1, 1, 1),
      hap('HG00004#1', 0, 1, 0),
    ],
    2,
  )!
  assert.deepEqual(
    panel.lanes.map(l => l.haplotype),
    ['HG00001#1', 'HG00003#1'],
  )
  assert.equal(panel.configurations, 4)
})

test('a haplotype with a missing call is left out of the grouping', () => {
  const panel = choosePanel([
    hap('HG00001#1', 0, 0),
    hap('HG00001#2', 0, undefined),
    hap('CHM13#2', undefined, undefined),
  ])!
  assert.equal(panel.haplotypes, 1)
  assert.equal(panel.configurations, 1)
  assert.deepEqual(panel.lanes, [
    { haplotype: 'HG00001#1', shares: 1, nonReference: 0 },
  ])
})

test('a haplotype the reader cannot serve never stands for a configuration', () => {
  const panel = choosePanel(
    [
      hap('HG00001#1', 0),
      hap('HG00002#1', 0),
      hap('HG00003#1', 1),
      hap('HG00004#1', 2),
    ],
    8,
    new Set(['HG00001#1', 'HG00004#1']),
  )!
  assert.equal(panel.configurations, 3)
  assert.deepEqual(panel.lanes, [
    { haplotype: 'HG00002#1', shares: 2, nonReference: 0 },
    { haplotype: 'HG00003#1', shares: 1, nonReference: 1 },
  ])
})

test('a window with no structural site has no panel', () => {
  assert.equal(choosePanel([hap('HG00001#1'), hap('HG00001#2')]), undefined)
  assert.equal(choosePanel([]), undefined)
})

test('a genotype splits into its two haplotypes, haploid and missing included', () => {
  assert.deepEqual(splitGenotype('0|1'), [0, 1])
  assert.deepEqual(splitGenotype('2|.'), [2, undefined])
  assert.deepEqual(splitGenotype('.'), [undefined, undefined])
  assert.deepEqual(splitGenotype('1/0'), [1, 0])
})
