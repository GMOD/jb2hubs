import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ALIGNED_TRACK_NAME,
  ORTHOLOG_TRACK_NAME,
  STAR_PANELS,
  geneOrderStarUrl,
  orthologPaf,
} from './geneOrderStar.ts'

import type { PlacedGene } from './neighborhood.ts'

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
const panel = STAR_PANELS.hg38!
const stars = { hg38: { mates: [...panel, 'hg19'], taxa: {} } }

const gene = (
  anchorId: string,
  assembly: string,
  refName: string,
  start: number,
  strand: 1 | -1 = 1,
): PlacedGene => ({
  anchorId,
  symbol: anchorId,
  assembly,
  refName,
  chromosome: '',
  start,
  end: start + 999,
  strand,
})

// TP53 and WRAP53 as NCBI places them, in human and in chicken's GRCg7b
const refGenes = [
  gene('7157', 'GCF_000001405.40', 'NC_000017.11', 7668402, -1),
  gene('55135', 'GCF_000001405.40', 'NC_000017.11', 7686071),
]
const chicken = {
  taxonId: 9031,
  genes: [
    gene('7157', 'GCF_016699485.2', 'NW_024096016.1', 5925),
    gene('55135', 'GCF_016699485.2', 'NW_024096012.1', 99755),
  ],
}
const hosted = (accession: string) => ({ accession })

test('the star opens one lane per panel genome, nearest first', () => {
  const star = geneOrderStarUrl({ ref: 'hg38', loc: LOC, stars })!
  const { views, sessionTracks } = sessionOf(star.url)
  assert.equal(star.genomes, panel.length)
  assert.deepEqual(views[0].tracks[0].rows.kept, panel)
  assert.equal(views[0].loc, LOC)
  assert.equal(sessionTracks.length, 1)
  assert.equal(sessionTracks[0].name, ALIGNED_TRACK_NAME)
})

test('the display travels in the session, not in a config an old JBrowse reads', () => {
  const star = geneOrderStarUrl({ ref: 'hg38', loc: LOC, stars })!
  assert.match(
    paramsOf(star.url).get('config')!,
    /^\/ucsc\/hg38\/config(-staging)?\.json$/,
  )
})

test('an aligned lane reads the chain ucsc2jbrowse wrote for its pair', () => {
  const star = geneOrderStarUrl({ ref: 'hg38', loc: LOC, stars })!
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
  const star = geneOrderStarUrl({
    ref: 'hg38',
    loc: LOC,
    stars,
    geneTrack: 'hg38-ncbiRefSeq',
  })!
  assert.deepEqual(
    sessionOf(star.url).sessionTracks[0].displays[0].laneGeneTracks,
    ['hg38-ncbiRefSeq'],
  )
})

test('chicken, where NCBI places the gene, moves to an NCBI ortholog lane', () => {
  const star = geneOrderStarUrl({
    ref: 'hg38',
    loc: LOC,
    stars,
    species: [chicken],
    refGenes,
    queryId: '7157',
    hosted,
  })!
  const { views, sessionTracks } = sessionOf(star.url)
  assert.equal(star.genomes, panel.length)
  assert.ok(!views[0].tracks[0].rows.kept.includes('galGal6'))
  assert.equal(sessionTracks[1].name, ORTHOLOG_TRACK_NAME)
  assert.deepEqual(views[0].tracks[1].rows.kept, ['GCF_016699485.2'])
  const paf = atob(
    sessionTracks[1].adapter.adapters[0].pafLocation.uri.split(',')[1],
  )
  assert.equal(paf.trim().split('\n').length, 1)
})

test('a distant genome NCBI does not place the gene in stays aligned', () => {
  const star = geneOrderStarUrl({
    ref: 'hg38',
    loc: LOC,
    stars,
    species: [chicken],
    refGenes,
    queryId: '3043',
    hosted,
  })!
  assert.equal(sessionOf(star.url).sessionTracks.length, 1)
})

test('an ortholog pair becomes a 0-based PAF record, reversed where strands differ', () => {
  assert.equal(
    orthologPaf(chicken.genes, refGenes, '7157'),
    [
      'NW_024096016.1',
      6924,
      5924,
      6924,
      '-',
      'NC_000017.11',
      7669401,
      7668401,
      7669401,
      1000,
      1000,
      60,
    ].join('\t'),
  )
})

test('a panel genome the star no longer holds is left out', () => {
  const star = geneOrderStarUrl({
    ref: 'hg38',
    loc: LOC,
    stars: { hg38: { mates: ['mm39', 'galGal6'], taxa: {} } },
  })!
  assert.deepEqual(sessionOf(star.url).views[0].tracks[0].rows.kept, [
    'mm39',
    'galGal6',
  ])
})

test('no link without a reference panel, a window or a lane', () => {
  assert.equal(geneOrderStarUrl({ ref: undefined, loc: LOC, stars }), undefined)
  assert.equal(
    geneOrderStarUrl({ ref: 'hg38', loc: undefined, stars }),
    undefined,
  )
  assert.equal(geneOrderStarUrl({ ref: 'mm39', loc: LOC, stars }), undefined)
  assert.equal(
    geneOrderStarUrl({
      ref: 'hg38',
      loc: LOC,
      stars: { hg38: { mates: ['hg19'], taxa: {} } },
    }),
    undefined,
  )
})
