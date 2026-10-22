import assert from 'node:assert'
import { test } from 'node:test'

import { geneDrilldownUrl, starUrl } from './multiSyntenyDrilldown.ts'
import { buildPairIndex } from './syntenyPairIndex.ts'

import type { DrilldownData } from './multiSyntenyDrilldown.ts'
import type { PlacedGene } from './neighborhood.ts'
import type { PairEntry } from './syntenyPairIndex.ts'

// Pull the decoded LinearSyntenyView spec back out of a launch URL.
function viewOf(url: string) {
  const spec = new URL(url).searchParams.get('session')!
  return JSON.parse(spec.replace(/^spec-/, '')).views[0]
}

// Every genome one we host at exactly the version NCBI reported
const exactly: DrilldownData['hosted'] = accession => ({
  accession,
  exact: true,
})

const HUMAN = 'GCF_000001405.40'
const HUMAN_HOSTED = {
  accession: HUMAN,
  ucscDb: 'hg38',
  exact: true,
}
const withHg38: DrilldownData['hosted'] = accession =>
  accession === HUMAN ? HUMAN_HOSTED : exactly(accession)
const DOG_V5_INEXACT = { accession: 'GCF_000002285.5', exact: false }

function drilldown(
  pairs: Record<string, PairEntry>,
  hosted = exactly,
  stars: DrilldownData['stars'] = {},
): DrilldownData {
  return { index: buildPairIndex(pairs), hosted, stars }
}

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
    { index: buildPairIndex({}), hosted: () => HUMAN_HOSTED },
  )!
  assert.equal(configOf(url), '/ucsc/hg38/config.json')
})

test('everything else still opens its sharded GenArk config', () => {
  const url = geneDrilldownUrl(
    gene('GCF_000002285.5'),
    'GCF_000001405.40',
    undefined,
    drilldown({}),
  )!
  assert.equal(
    configOf(url),
    '/hubs/genark/GCF/000/002/285/GCF_000002285.5/config.json',
  )
})

// find() answers with the version we host, and that is the config to open —
// launching the version NCBI named would 404.
test('a version we do not host opens the one we do', () => {
  const url = geneDrilldownUrl(gene('GCF_000002285.9'), undefined, undefined, {
    index: buildPairIndex({}),
    hosted: () => DOG_V5_INEXACT,
  })!
  assert.match(url, /GCF_000002285\.5/)
})

test('a genome the index does not know opens nothing', () => {
  assert.equal(
    geneDrilldownUrl(gene('GCF_999999999.1'), undefined, undefined, {
      index: buildPairIndex({}),
      hosted: () => undefined,
    }),
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
    { index, hosted: exactly },
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
      { index, hosted: withHg38 },
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
      { index, hosted: withHg38 },
    )!,
  )
  assert.ok(
    view.views.every((v: { loc: string }) => !v.loc.includes('[rev]')),
    'no panel should carry [rev]',
  )
})

const DOG_PAIRS = {
  'GCF_000002285.1,GCF_000001405.40': [
    'dog_to_hg38',
    'GCF_000002285.1',
    'hg38',
  ] satisfies PairEntry,
}
const hostedDogV1: DrilldownData['hosted'] = accession =>
  accession === 'GCF_000002285.2'
    ? { accession: 'GCF_000002285.1', exact: false }
    : accession === HUMAN
      ? HUMAN_HOSTED
      : undefined

// NCBI placed the gene on .2 and we host .1, which the catalog also names: the
// panel would open .1 at .2's refNames.
test('a gene placed on a version we do not host opens one genome', () => {
  const url = geneDrilldownUrl(
    gene('GCF_000002285.2'),
    HUMAN,
    gene(HUMAN),
    drilldown(DOG_PAIRS, hostedDogV1),
  )!
  assert.equal(
    configOf(url),
    '/hubs/genark/GCF/000/002/285/GCF_000002285.1/config.json',
  )
})

test('a reference gene placed on a version we do not host opens one genome', () => {
  const url = geneDrilldownUrl(
    gene('GCF_000002285.1'),
    HUMAN,
    gene(HUMAN),
    drilldown(DOG_PAIRS, accession =>
      accession === HUMAN
        ? { ...HUMAN_HOSTED, exact: false }
        : { accession, exact: true },
    ),
  )!
  assert.equal(
    configOf(url),
    '/hubs/genark/GCF/000/002/285/GCF_000002285.1/config.json',
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
    geneDrilldownUrl(gene('GCF_000002285.5'), 'GCF_000001405.40', undefined, {
      index,
      hosted: exactly,
    })!,
  )
  assert.equal(view.type, 'LinearSyntenyView')
  assert.deepEqual(view.tracks, ['dog_to_hg38'])
})

const hostedHuman: DrilldownData['hosted'] = accession =>
  accession === HUMAN
    ? { accession, ucscDb: 'hg38', exact: true }
    : accession === 'GCF_000002285.5'
      ? { accession, ucscDb: 'canFam3', exact: true }
      : { accession, exact: true }
const CHIMP = 9598
const DOG = 9615
const stars = {
  hg38: {
    mates: ['panTro6', 'canFam3', 'canFam6', 'mm39'],
    taxa: { [CHIMP]: 'panTro6', [DOG]: 'canFam6', 10090: 'mm39' },
  },
}

function starTrackOf(url: string) {
  return viewOf(url).tracks[0]
}

test("the star opens on the page's window, one lane per species it holds", () => {
  const url = starUrl(
    HUMAN,
    'NC_000017.11:7000000-7100000',
    [
      { taxonId: CHIMP, assembly: 'GCF_028858775.2' },
      { taxonId: DOG, assembly: 'GCF_000002285.5' },
      { taxonId: 9999, assembly: 'GCF_1.1' },
      { taxonId: CHIMP, assembly: 'GCF_002880755.1' },
    ],
    drilldown({}, hostedHuman, stars),
  )!
  assert.match(url, /config=%2Fucsc%2Fhg38%2Fconfig/)
  assert.equal(viewOf(url).assembly, 'hg38')
  assert.equal(viewOf(url).loc, 'NC_000017.11:7000000-7100000')
  assert.deepEqual(starTrackOf(url), {
    trackId: 'hg38_liftOver_multiway',
    type: 'MultiWaySyntenyDisplay',
    rows: {
      kept: ['panTro6', 'canFam3'],
      sort: ['panTro6', 'canFam3'],
      domain: ['panTro6', 'canFam3'],
    },
    height: 150,
  })
})

test('no star for a reference without one, or one that is not a UCSC genome', () => {
  const chimp = [{ taxonId: CHIMP }]
  assert.equal(
    starUrl(HUMAN, 'chr1:1-2', chimp, drilldown({}, hostedHuman)),
    undefined,
  )
  assert.equal(
    starUrl(HUMAN, 'chr1:1-2', chimp, drilldown({}, undefined, stars)),
    undefined,
  )
})

test("with none of the page's species a lane, the star opens on its own lanes", () => {
  const url = starUrl(
    HUMAN,
    'chr1:1-2',
    [{ taxonId: 9999 }],
    drilldown({}, hostedHuman, stars),
  )!
  assert.deepEqual(starTrackOf(url), {
    trackId: 'hg38_liftOver_multiway',
    type: 'MultiWaySyntenyDisplay',
  })
})
