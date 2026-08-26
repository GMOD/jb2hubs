import assert from 'node:assert'
import { test } from 'node:test'

import {
  accessionBase,
  buildPairIndex,
  resolveStackNames,
  syntenyLink,
} from './syntenyPairIndex.ts'

test('accessionBase strips version and assembly-name suffix', () => {
  assert.equal(accessionBase('GCF_000001405.40'), 'GCF_000001405')
  assert.equal(accessionBase('GCF_000001735.4_TAIR10.1'), 'GCF_000001735')
  // No underscore-id shape (e.g. UCSC db names) passes through untouched.
  assert.equal(accessionBase('hg38'), 'hg38')
})

test('syntenyLink matches regardless of version, name suffix, or key order', () => {
  const index = buildPairIndex({
    'GCF_000001735.3,GCF_000001735.4_TAIR10.1': [
      'liftOver',
      'GCF_000001735.3',
      'GCF_000001735.4_TAIR10.1',
    ],
    'GCF_000002315.6,GCF_004027225.2': [
      'chicken',
      'GCF_000002315.6',
      'GCF_004027225.2',
    ],
  })
  // Caller holds a different version than the catalog key.
  assert.equal(
    syntenyLink(index, 'GCF_000001735.9', 'GCF_000001735.1')?.trackId,
    'liftOver',
  )
  // Reversed order still resolves.
  assert.equal(
    syntenyLink(index, 'GCF_004027225.2', 'GCF_000002315.6')?.trackId,
    'chicken',
  )
  assert.equal(
    syntenyLink(index, 'GCF_000002315.6', 'GCF_999999999.1'),
    undefined,
  )
})

// The names are what a launch URL uses for its panels, so a reversed lookup that
// returned them in catalog order would point each panel at the other genome.
test('a reversed lookup returns the names in the order asked for', () => {
  const index = buildPairIndex({
    'GCF_000002285.5,GCF_000001405.40': [
      'canFam3_to_hg38_liftOver',
      'canFam3',
      'hg38',
    ],
  })
  assert.deepEqual(
    syntenyLink(index, 'GCF_000002285.5', 'GCF_000001405.40')?.names,
    ['canFam3', 'hg38'],
  )
  assert.deepEqual(
    syntenyLink(index, 'GCF_000001405.40', 'GCF_000002285.5')?.names,
    ['hg38', 'canFam3'],
  )
})

// A human comparison lives in /ucsc/hg38/config.json and names that genome
// `hg38`; a launch built from the accession would merge a hub without the track.
test('resolveStackNames takes each panel name from its own link', () => {
  const index = buildPairIndex({
    'GCF_000002285.5,GCF_000001405.40': [
      'canFam3_to_hg38_liftOver',
      'canFam3',
      'hg38',
    ],
    'GCF_000001405.40,GCF_000001635.26': ['hg38_to_mm39', 'hg38', 'mm39'],
  })
  const { names, tracks } = resolveStackNames(
    ['GCF_000002285.5', 'GCF_000001405.40', 'GCF_000001635.26'],
    index,
  )
  assert.deepEqual(names, ['canFam3', 'hg38', 'mm39'])
  assert.deepEqual(tracks, [['canFam3_to_hg38_liftOver'], ['hg38_to_mm39']])
})

// One genome, two names in the catalog: dm6 and its own GenArk accession. Only
// one of them can be the panel, so the second level has to give up its track
// rather than name a panel its track could not bind to.
test('resolveStackNames drops a level whose link contradicts a settled name', () => {
  const index = buildPairIndex({
    'GCF_000001215.4,GCF_000002335.3': [
      'dm6_to_beetle',
      'dm6',
      'GCF_000002335.3',
    ],
    'GCF_000001215.4,GCF_000001635.26': [
      'flyAcc_to_mm39',
      'GCF_000001215.4',
      'mm39',
    ],
  })
  const { names, tracks } = resolveStackNames(
    ['GCF_000002335.3', 'GCF_000001215.4', 'GCF_000001635.26'],
    index,
  )
  assert.deepEqual(names, ['GCF_000002335.3', 'dm6', 'GCF_000001635.26'])
  assert.deepEqual(tracks, [['dm6_to_beetle'], []])
})

test('a level with no catalog entry keeps its empty slot', () => {
  const { names, tracks } = resolveStackNames(
    ['GCF_000000001.1', 'GCF_000000002.1'],
    buildPairIndex({}),
  )
  assert.deepEqual(names, ['GCF_000000001.1', 'GCF_000000002.1'])
  assert.deepEqual(tracks, [[]])
})
