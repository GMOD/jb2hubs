import assert from 'node:assert'
import { test } from 'node:test'

import { geneDrilldownUrl, subtreeSyntenyUrl } from './multiSyntenyDrilldown.ts'
import { buildPairIndex } from './syntenyPairIndex.ts'

import type { SubtreeLeaf } from './multiSyntenyDrilldown.ts'
import type { PlacedGene } from './neighborhood.ts'

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

// A synteny sub-view has no defaultSession, so a panel launched without a track
// draws nothing at the locus it was sent to.
test('each panel opens the gene track its own link names', () => {
  const index = buildPairIndex({
    'GCF_1,GCF_2': ['t12', 'GCF_1', 'GCF_2', 'GCF_1-ncbiRefSeq', 'GCF_2-ncbiRefSeq'],
    'GCF_2,GCF_3': ['t23', 'GCF_2', 'GCF_3', 'GCF_2-ncbiRefSeq', 'GCF_3-ncbiRefSeq'],
  })
  const url = subtreeSyntenyUrl(
    [leaf('GCF_1.4'), leaf('GCF_2.7'), leaf('GCF_3.2')],
    index,
  )!
  assert.deepEqual(
    viewOf(url).views.map((v: { tracks?: string[] }) => v.tracks),
    [['GCF_1-ncbiRefSeq'], ['GCF_2-ncbiRefSeq'], ['GCF_3-ncbiRefSeq']],
  )
})

// A catalog with no gene tracks (a pre-gene-tracks synteny_pairs.json) launches
// the panels bare rather than naming a track that does not exist.
test('a panel with no known gene track carries no tracks field', () => {
  const index = buildPairIndex({
    'GCF_1,GCF_2': ['t12', 'GCF_1', 'GCF_2'],
  })
  const url = subtreeSyntenyUrl([leaf('GCF_1.4'), leaf('GCF_2.7')], index)!
  assert.deepEqual(
    viewOf(url).views.map((v: { tracks?: string[] }) => v.tracks),
    [undefined, undefined],
  )
})

const gene = (assembly: string): PlacedGene => ({
  anchorId: 'a',
  symbol: 'TP53',
  assembly,
  refName: 'NC_000017.11',
  chromosome: '17',
  start: 7_668_421,
  end: 7_687_490,
  strand: 1,
})

function configOf(url: string) {
  return new URL(url).searchParams.get('config')
}

// The bug this guards: the GenArk config for a UCSC-native genome exists, so a
// launch built from the bare accession looked fine, but its 2bit and chrom.sizes
// both 404 and the browser opens with no sequence.
test('a UCSC-native genome opens its curated config, not the GenArk one', () => {
  const url = geneDrilldownUrl(
    gene('GCF_000001405.40'),
    'GCF_000001405.40',
    undefined,
    buildPairIndex({}),
    { accession: 'GCF_000001405.40', ucscDb: 'hg38' },
  )!
  assert.equal(configOf(url), '/ucsc/hg38/config.json')
})

test('everything else still opens its sharded GenArk config', () => {
  const url = geneDrilldownUrl(
    gene('GCF_000002285.5'),
    'GCF_000001405.40',
    undefined,
    buildPairIndex({}),
    { accession: 'GCF_000002285.5' },
  )!
  assert.equal(
    configOf(url),
    '/hubs/genark/GCF/000/002/285/GCF_000002285.5/config.json',
  )
})

// find() answers with the version we host, and that is the config to open —
// launching the version NCBI named would 404.
test('a version we do not host opens the one we do', () => {
  const url = geneDrilldownUrl(
    gene('GCF_000002285.9'),
    undefined,
    undefined,
    buildPairIndex({}),
    { accession: 'GCF_000002285.5' },
  )!
  assert.match(url, /GCF_000002285\.5/)
})

test('a genome the index does not know opens nothing', () => {
  assert.equal(
    geneDrilldownUrl(
      gene('GCF_999999999.1'),
      undefined,
      undefined,
      buildPairIndex({}),
      undefined,
    ),
    undefined,
  )
})

// The catalog names the .1 build; NCBI reported the gene against .2. The panel
// would open .1 and the .2 locstring would resolve against neither, so the
// pairwise launch is given up in favour of one genome that does navigate.
test('a pairwise link naming another version falls back to one genome', () => {
  const index = buildPairIndex({
    'GCF_000002285.1,GCF_000001405.40': [
      'dog_to_hg38',
      'GCF_000002285.1',
      'hg38',
    ],
  })
  const url = geneDrilldownUrl(
    gene('GCF_000002285.5'),
    'GCF_000001405.40',
    undefined,
    index,
    { accession: 'GCF_000002285.5' },
  )!
  assert.equal(
    configOf(url),
    '/hubs/genark/GCF/000/002/285/GCF_000002285.5/config.json',
  )
})

test('a pairwise link naming the genome we opened is used', () => {
  const index = buildPairIndex({
    'GCF_000002285.5,GCF_000001405.40': [
      'dog_to_hg38',
      'GCF_000002285.5',
      'hg38',
    ],
  })
  const view = viewOf(
    geneDrilldownUrl(
      gene('GCF_000002285.5'),
      'GCF_000001405.40',
      undefined,
      index,
      { accession: 'GCF_000002285.5' },
    )!,
  )
  assert.equal(view.type, 'LinearSyntenyView')
  assert.deepEqual(view.tracks, ['dog_to_hg38'])
})
