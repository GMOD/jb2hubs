import assert from 'node:assert'
import { test } from 'node:test'

import {
  geneDrilldownUrl,
  nearestWindow,
  refAlignmentUrl,
  subtreeSyntenyUrl,
} from './multiSyntenyDrilldown.ts'
import { MAX_PICKED_GENOMES } from './multiSyntenyPicker.ts'
import { buildPairIndex } from './syntenyPairIndex.ts'

import type { DrilldownData, SubtreeLeaf } from './multiSyntenyDrilldown.ts'
import type { PlacedGene } from './neighborhood.ts'
import type { PairEntry } from './syntenyPairIndex.ts'

// Pull the decoded LinearSyntenyView spec back out of a launch URL.
function viewOf(url: string) {
  const spec = new URL(url).searchParams.get('session')!
  return JSON.parse(spec.replace(/^spec-/, '')).views[0]
}

const leaf = (assembly: string, flipped = false): SubtreeLeaf => ({
  assembly,
  loc: 'chr1:1-1000',
  flipped,
})

// Every leaf a genome we host at exactly the version NCBI reported, unless a
// test says otherwise.
function drilldown(
  pairs: Record<string, PairEntry>,
  hosted: DrilldownData['hosted'] = accession => ({ accession }),
): DrilldownData {
  return { index: buildPairIndex(pairs), hosted }
}

test('subtreeSyntenyUrl needs at least two genomes', () => {
  assert.equal(subtreeSyntenyUrl([], drilldown({})), undefined)
  assert.equal(subtreeSyntenyUrl([leaf('GCF_1.1')], drilldown({})), undefined)
})

// JBrowse binds a synteny track to a level by array position, so a level with no
// chain must occupy its own empty slot — otherwise later tracks slide up onto the
// wrong pair of genomes (the bug this guards against).
test('tracks are one per level, empty where no chain exists', () => {
  const url = subtreeSyntenyUrl(
    [leaf('GCF_1.9'), leaf('GCF_2.9'), leaf('GCF_3.1')],
    drilldown({ 'GCF_1.9,GCF_2.9': ['track_1_2', 'GCF_1.9', 'GCF_2.9'] }),
  )!
  const view = viewOf(url)
  // three genomes -> two levels: [pair 1-2 has a track] then [pair 2-3 empty]
  assert.deepEqual(view.tracks, [['track_1_2'], []])
  assert.equal(view.views.length, 3)
})

const chained: Record<string, PairEntry> = {
  'GCF_1.4,GCF_2.7': [
    't12',
    'GCF_1.4',
    'GCF_2.7',
    'GCF_1-ncbiRefSeq',
    'GCF_2-ncbiRefSeq',
  ],
  'GCF_2.7,GCF_3.2': [
    't23',
    'GCF_2.7',
    'GCF_3.2',
    'GCF_2-ncbiRefSeq',
    'GCF_3-ncbiRefSeq',
  ],
}

test('a fully-chained subtree yields one track slot per level', () => {
  const url = subtreeSyntenyUrl(
    [leaf('GCF_1.4'), leaf('GCF_2.7'), leaf('GCF_3.2')],
    drilldown(chained),
  )!
  assert.deepEqual(viewOf(url).tracks, [['t12'], ['t23']])
})

// A synteny sub-view has no defaultSession, so a panel launched without a track
// draws nothing at the locus it was sent to.
test('each panel opens the gene track its own link names', () => {
  const url = subtreeSyntenyUrl(
    [leaf('GCF_1.4'), leaf('GCF_2.7'), leaf('GCF_3.2')],
    drilldown(chained),
  )!
  assert.deepEqual(
    viewOf(url).views.map((v: { tracks?: string[] }) => v.tracks),
    [['GCF_1-ncbiRefSeq'], ['GCF_2-ncbiRefSeq'], ['GCF_3-ncbiRefSeq']],
  )
})

// A catalog with no gene tracks (a pre-gene-tracks synteny_pairs.json) launches
// the panels bare rather than naming a track that does not exist.
test('a panel with no known gene track carries no tracks field', () => {
  const url = subtreeSyntenyUrl(
    [leaf('GCF_1.4'), leaf('GCF_2.7')],
    drilldown({ 'GCF_1.4,GCF_2.7': ['t12', 'GCF_1.4', 'GCF_2.7'] }),
  )!
  assert.deepEqual(
    viewOf(url).views.map((v: { tracks?: string[] }) => v.tracks),
    [undefined, undefined],
  )
})

// A row the page draws mirrored opens its panel mirrored too, or the launch is
// the mirror image of the figure that was clicked.
test('a mirrored row opens its panel flipped', () => {
  const view = viewOf(
    subtreeSyntenyUrl(
      [leaf('GCF_1.1'), leaf('GCF_2.1', true)],
      drilldown({ 'GCF_1.1,GCF_2.1': ['t12', 'GCF_1.1', 'GCF_2.1'] }),
    )!,
  )
  assert.deepEqual(
    view.views.map((v: { loc: string }) => v.loc),
    ['chr1:1-1000', 'chr1:1-1000[rev]'],
  )
})

// NCBI annotated the middle genome's .2, which we host; the catalog's pairs are
// against its .1. Opening that panel as .1 would hand it a locus from .2, so
// both of its levels go, and the panel opens as the genome its locus is in.
test('a level whose link names another version of a leaf is dropped', () => {
  const view = viewOf(
    subtreeSyntenyUrl(
      [leaf('GCF_1.1'), leaf('GCF_2.2'), leaf('GCF_3.1')],
      drilldown({
        'GCF_1.1,GCF_2.1': ['t12', 'GCF_1.1', 'GCF_2.1'],
        'GCF_2.1,GCF_3.1': ['t23', 'GCF_2.1', 'GCF_3.1'],
      }),
    )!,
  )
  assert.deepEqual(view.tracks, [[], []])
  assert.deepEqual(
    view.views.map((v: { assembly: string }) => v.assembly),
    ['GCF_1.1', 'GCF_2.2', 'GCF_3.1'],
  )
})

// The assembly index answers with the version we host, and a link naming that
// one is the genome the panel opens either way.
test('a link naming the version the index resolves to is kept', () => {
  const view = viewOf(
    subtreeSyntenyUrl(
      [leaf('GCF_1.9'), leaf('GCF_2.1')],
      drilldown(
        { 'GCF_1.5,GCF_2.1': ['t12', 'GCF_1.5', 'GCF_2.1'] },
        accession => ({
          accession: accession === 'GCF_1.9' ? 'GCF_1.5' : accession,
        }),
      ),
    )!,
  )
  assert.deepEqual(view.tracks, [['t12']])
})

// Human's GenArk hub has no sequence, so a human panel that no level names
// still has to open /ucsc/hg38.
test('a panel no level names opens under its hosted genome', () => {
  const url = subtreeSyntenyUrl(
    [leaf('GCF_000001405.40'), leaf('GCF_2.1')],
    drilldown({}, accession =>
      accession === 'GCF_000001405.40'
        ? { accession, ucscDb: 'hg38' }
        : { accession },
    ),
  )!
  assert.deepEqual(
    viewOf(url).views.map((v: { assembly: string }) => v.assembly),
    ['hg38', 'GCF_2.1'],
  )
})

// CloudFront refuses a request line over 8,192 bytes, which is why the view's
// "open more of this clade" stops at MAX_PICKED_GENOMES. Every name here is as
// long as the catalog's longest, and every panel flipped.
test('the widest clade launch fits the request line', () => {
  const acc = (i: number) => `GCF_${String(900_000_000 + i)}.1`
  const pairs: Record<string, PairEntry> = {}
  for (let i = 1; i < MAX_PICKED_GENOMES; i++) {
    const [a, b] = [acc(i - 1), acc(i)]
    pairs[`${a},${b}`] = [
      `${a}_to_${b}_liftOver`,
      a,
      b,
      `${a}-ncbiRefSeq`,
      `${b}-ncbiRefSeq`,
    ]
  }
  const leaves = Array.from({ length: MAX_PICKED_GENOMES }, (_, i) => ({
    assembly: acc(i),
    loc: 'NC_000000000.1:100000000-200000000',
    flipped: true,
  }))
  const url = subtreeSyntenyUrl(leaves, drilldown(pairs))!
  assert.ok(url.length < 8192, `${url.length} bytes`)
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

// The CLICKED genome's panel is the one that flips, not the reference: the page
// mirrors a row relative to the reference, so the reference is the frame.
test('a pairwise drill-down from a mirrored row flips the clicked panel', () => {
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
      gene('GCF_000001405.40'),
      index,
      { accession: 'GCF_000002285.5' },
      true,
    )!,
  )
  assert.deepEqual(
    view.views.map((v: { assembly: string; loc: string }) => [
      v.assembly,
      v.loc,
    ]),
    [
      ['GCF_000002285.5', 'NC_000017.11:7568421-7787490[rev]'],
      ['hg38', 'NC_000017.11:7568421-7787490'],
    ],
  )
})

test('an unmirrored row flips nothing', () => {
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
      gene('GCF_000001405.40'),
      index,
      { accession: 'GCF_000002285.5' },
    )!,
  )
  assert.ok(
    view.views.every((v: { loc: string }) => !v.loc.includes('[rev]')),
    'no panel should carry [rev]',
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

// Tree order runs basal→derived, so the head of a clade holding the reference is
// its most distant members; the window is centered on the reference instead.
test('nearestWindow centers on the reference and clamps at both ends', () => {
  const leaves = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  assert.deepEqual(nearestWindow(leaves, 4, 3), ['d', 'e', 'f'])
  assert.deepEqual(nearestWindow(leaves, 0, 3), ['a', 'b', 'c'])
  assert.deepEqual(nearestWindow(leaves, 7, 3), ['f', 'g', 'h'])
  assert.deepEqual(nearestWindow(leaves, 4, 20), leaves)
})

test('a reference outside the clade takes the head of the list', () => {
  assert.deepEqual(nearestWindow(['a', 'b', 'c'], -1, 2), ['a', 'b'])
})

test('the reference alignment opens on the NCBI sequence accession', () => {
  const human = gene('GCF_000001405.40')
  const unnamed = { ...human, chromosome: 'NC_000017.11' }
  for (const g of [human, unnamed]) {
    const url = refAlignmentUrl(9606, g)!
    assert.equal(configOf(url), '/ucsc/hg38/config.json')
    assert.equal(viewOf(url).loc, 'NC_000017.11:7668421-7687490')
  }
  assert.equal(refAlignmentUrl(10090, human), undefined)
})
