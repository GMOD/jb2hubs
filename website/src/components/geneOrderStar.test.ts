import assert from 'node:assert/strict'
import { test } from 'node:test'

import { STAR_PANELS, geneOrderStarUrl } from './geneOrderStar.ts'

function paramsOf(url: string) {
  const u = new URL(url)
  return new URLSearchParams(u.hash ? u.hash.slice(1) : u.search)
}

function sessionOf(url: string) {
  return JSON.parse(
    paramsOf(url)
      .get('session')!
      .replace(/^spec-/, ''),
  )
}

const LOC = 'NC_000011.10:5219561-5349427'
const allMates = { hg38: { mates: [...STAR_PANELS.hg38!, 'hg19'], taxa: {} } }

test('the star opens one lane per panel genome, nearest first', () => {
  const star = geneOrderStarUrl('hg38', LOC, allMates)!
  const { views, sessionTracks } = sessionOf(star.url)
  assert.equal(star.genomes, STAR_PANELS.hg38!.length)
  assert.deepEqual(views[0].tracks[0].rows.kept, STAR_PANELS.hg38)
  assert.equal(views[0].assembly, 'hg38')
  assert.equal(views[0].loc, LOC)
  assert.deepEqual(
    sessionTracks[0].adapter.lanes.map((l: { name: string }) => l.name),
    STAR_PANELS.hg38,
  )
})

test('the display travels in the session, not in a config an old JBrowse reads', () => {
  const star = geneOrderStarUrl('hg38', LOC, allMates)!
  assert.match(
    paramsOf(star.url).get('config')!,
    /^\/ucsc\/hg38\/config(-staging)?\.json$/,
  )
  assert.equal(sessionOf(star.url).sessionTracks[0].type, 'SyntenyTrack')
})

test('a lane reads the chain ucsc2jbrowse wrote for its pair', () => {
  const star = geneOrderStarUrl('hg38', LOC, allMates)!
  const uris = sessionOf(star.url).sessionTracks[0].adapter.adapters.map(
    (a: { pifGzLocation: { uri: string } }) => a.pifGzLocation.uri,
  )
  assert.ok(
    uris.includes(
      'https://jbrowse.org/ucsc/hg38/liftOver/hg38ToMm39.over.pif.gz',
    ),
  )
  assert.ok(
    uris.includes(
      'https://jbrowse.org/ucsc/hg38/liftOver/hg38ToGCF_029281585.2.over.pif.gz',
    ),
  )
})

test('the reference lane draws the gene track the page names', () => {
  const star = geneOrderStarUrl('hg38', LOC, allMates, 'hg38-ncbiRefSeq')!
  assert.deepEqual(
    sessionOf(star.url).sessionTracks[0].displays[0].laneGeneTracks,
    ['hg38-ncbiRefSeq'],
  )
})

test('a panel genome the star no longer holds is left out', () => {
  const star = geneOrderStarUrl('hg38', LOC, {
    hg38: { mates: ['mm39', 'galGal6'], taxa: {} },
  })!
  assert.deepEqual(sessionOf(star.url).views[0].tracks[0].rows.kept, [
    'mm39',
    'galGal6',
  ])
})

test('no link without a reference panel, a window or a lane', () => {
  assert.equal(geneOrderStarUrl(undefined, LOC, allMates), undefined)
  assert.equal(geneOrderStarUrl('hg38', undefined, allMates), undefined)
  assert.equal(geneOrderStarUrl('mm39', LOC, allMates), undefined)
  assert.equal(
    geneOrderStarUrl('hg38', LOC, { hg38: { mates: ['hg19'], taxa: {} } }),
    undefined,
  )
})
