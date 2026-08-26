import assert from 'node:assert'
import { test } from 'node:test'

import { subtreeSyntenyUrl } from './multiSyntenyDrilldown.ts'
import { buildPairIndex } from './syntenyPairIndex.ts'

import type { SubtreeLeaf } from './multiSyntenyDrilldown.ts'

// Pull the decoded LinearSyntenyView spec back out of a launch URL.
function viewOf(url: string) {
  const spec = new URL(url).searchParams.get('session')!
  return JSON.parse(spec.replace(/^spec-/, '')).views[0]
}

const leaf = (assembly: string): SubtreeLeaf => ({
  assembly,
  loc: 'chr1:1-1000',
})

test('subtreeSyntenyUrl needs at least two genomes', () => {
  const index = buildPairIndex({})
  assert.equal(subtreeSyntenyUrl([], index), undefined)
  assert.equal(subtreeSyntenyUrl([leaf('GCF_1.1')], index), undefined)
})

// JBrowse binds a synteny track to a level by array position, so a level with no
// chain must occupy its own empty slot — otherwise later tracks slide up onto the
// wrong pair of genomes (the bug this guards against).
test('tracks are one per level, empty where no chain exists', () => {
  const index = buildPairIndex({
    'GCF_1.9,GCF_2.9': ['track_1_2', 'GCF_1.9', 'GCF_2.9'],
  })
  const url = subtreeSyntenyUrl(
    [leaf('GCF_1.1'), leaf('GCF_2.1'), leaf('GCF_3.1')],
    index,
  )!
  const view = viewOf(url)
  // three genomes -> two levels: [pair 1-2 has a track] then [pair 2-3 empty]
  assert.deepEqual(view.tracks, [['track_1_2'], []])
  assert.equal(view.views.length, 3)
})

test('a fully-chained subtree yields one track slot per level', () => {
  const index = buildPairIndex({
    'GCF_1,GCF_2': ['t12', 'GCF_1', 'GCF_2'],
    'GCF_2,GCF_3': ['t23', 'GCF_2', 'GCF_3'],
  })
  const url = subtreeSyntenyUrl(
    [leaf('GCF_1.4'), leaf('GCF_2.7'), leaf('GCF_3.2')],
    index,
  )!
  assert.deepEqual(viewOf(url).tracks, [['t12'], ['t23']])
})
