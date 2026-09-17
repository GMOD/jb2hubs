import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { HPRC_GRAPH_BROWSER } from './pangenomeDataset.ts'
import {
  annotatedHaplotypes,
  choosePanel,
  splitGenotype,
} from './pangenomePanels.ts'

import type { LaneConfig } from './pangenomePanels.ts'

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
    { size: 8 },
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
    { size: 2 },
  )!
  assert.deepEqual(
    panel.lanes.map(l => l.haplotype),
    ['HG00001#1', 'HG00003#1'],
  )
  assert.equal(panel.configurations, 4)
})

test('a configuration is drawn by a member whose lane has gene models', () => {
  const genotypes = [
    hap('HG00001#1', 0),
    hap('HG00002#1', 0),
    hap('HG00003#1', 1),
  ]
  const annotated = new Set(['HG00002#1'])
  assert.deepEqual(
    choosePanel(genotypes, { annotated })!.lanes.map(l => l.haplotype),
    ['HG00002#1', 'HG00003#1'],
  )
  assert.deepEqual(
    choosePanel(genotypes)!.lanes.map(l => l.haplotype),
    ['HG00001#1', 'HG00003#1'],
  )
})

// The panels are only as annotated as this set: a lane the track maps to an
// assembly with no gene track of its own reads "no annotation".
test('every haplotype the lane track maps to an assembly has gene models', () => {
  const config = JSON.parse(
    readFileSync(
      new URL('../../pangenome-config/hprc-grch38.json', import.meta.url),
      'utf8',
    ),
  ) as LaneConfig
  const trackId = HPRC_GRAPH_BROWSER.haplotypeLanesTrackId!
  const lanes = config.tracks.find(t => t.trackId === trackId)!
  const mapped = Object.values(lanes.adapter.assemblyNameToPanSN!).filter(
    h => h !== 'GRCh38#0',
  )
  assert.ok(mapped.length > 0)
  assert.deepEqual(
    [...annotatedHaplotypes(config, trackId)].sort(),
    mapped.sort(),
  )
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
