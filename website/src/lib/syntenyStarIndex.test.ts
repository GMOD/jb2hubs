import assert from 'node:assert'
import { test } from 'node:test'

import { starIndex } from './syntenyStarIndex.ts'
import { starLane } from './syntenyStars.ts'

import type { AssemblyInfo, SyntenyCatalogData } from './syntenyCatalog.ts'

const info = (
  taxonId: number | undefined,
  source: AssemblyInfo['source'] = 'ucsc',
): AssemblyInfo => ({ source, taxonId, geneTrack: '' })

const liftOver = (anchor: string, mate: string) => ({
  trackId: `${anchor}_to_${mate}_liftOver`,
  assemblyNames: [anchor, mate],
  chain: `liftOver/${anchor}To${mate}.over.pif.gz`,
})

const CHIMP = 9598
const PLATYPUS = 9258
const DOG = 9615

const data: SyntenyCatalogData = {
  tracks: [
    liftOver('hg38', 'panTro3'),
    liftOver('hg38', 'panTro6'),
    liftOver('hg38', 'ornAna2'),
    liftOver('hg38', 'GCF_004115215.2'),
    liftOver('hg38', 'GCA_031010295.1'),
    liftOver('hg38', 'GCF_014441545.1'),
    liftOver('hg38', 'noTaxon1'),
    liftOver('rn6', 'hg38'),
    {
      trackId: 'hg38_to_canFam6_chainBridge',
      assemblyNames: ['hg38', 'canFam6'],
    },
  ],
  assemblyInfo: {
    panTro3: info(CHIMP),
    panTro6: info(CHIMP),
    ornAna2: info(PLATYPUS),
    'GCF_004115215.2': info(PLATYPUS, 'genark'),
    'GCA_031010295.1': info(DOG, 'genark'),
    'GCF_014441545.1': info(DOG, 'genark'),
    canFam6: info(DOG),
    noTaxon1: info(undefined),
  },
}

test("a species' lane is UCSC's newest build of it, else its newest GenArk assembly", () => {
  const { hg38 } = starIndex(data, ['hg38'])
  assert.deepEqual(hg38?.taxa, {
    [CHIMP]: 'panTro6',
    [PLATYPUS]: 'ornAna2',
    [DOG]: 'GCA_031010295.1',
  })
  assert.equal(hg38?.mates.length, 7)
})

test('a lane carries the chain file its track names', () => {
  const { hg38 } = starIndex(data, ['hg38'])
  assert.deepEqual(Object.keys(hg38?.chains ?? {}), hg38?.mates)
  assert.equal(hg38?.chains.panTro6, 'liftOver/hg38TopanTro6.over.pif.gz')
})

test('a liftOver track with no chain file fails the index', () => {
  const bare: SyntenyCatalogData = {
    tracks: [
      {
        trackId: 'hg38_to_mm39_liftOver',
        assemblyNames: ['hg38', 'mm39'],
      },
    ],
    assemblyInfo: {},
  }
  assert.throws(() => starIndex(bare, ['hg38']), /hg38_to_mm39_liftOver/)
})

test("a row whose own assembly the star holds opens that assembly's lane", () => {
  const { hg38 } = starIndex(data, ['hg38'])
  const hosted = (accession: string) =>
    accession === 'GCF_000001515.7'
      ? { accession, ucscDb: 'panTro3' }
      : { accession }
  const lane = (taxonId: number, assembly?: string) =>
    starLane(hg38!, { taxonId, assembly }, hosted)
  assert.equal(lane(PLATYPUS, 'GCF_004115215.2'), 'GCF_004115215.2')
  assert.equal(lane(CHIMP, 'GCF_000001515.7'), 'panTro3')
  assert.equal(lane(CHIMP, 'GCF_028858775.2'), 'panTro6')
  assert.equal(lane(9999), undefined)
})

test('a reference with fewer mates than the builder stars has no entry', () => {
  assert.deepEqual(starIndex(data, ['rn6', 'mm39']), {})
})

test('a mate the catalog lists twice counts once toward the floor', () => {
  const twice: SyntenyCatalogData = {
    tracks: [
      liftOver('GCF_040939455.1', 'hg38'),
      liftOver('GCF_040939455.1', 'hg38'),
      liftOver('GCF_040939455.1', 'GCF_000165445.2'),
      liftOver('GCF_040939455.1', 'GCF_000165445.2'),
    ],
    assemblyInfo: {},
  }
  assert.deepEqual(starIndex(twice, ['GCF_040939455.1']), {})
})
