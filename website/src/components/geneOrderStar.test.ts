import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ALIGNED_TRACK_NAME,
  MIXED_TRACK_NAME,
  ORTHOLOG_TRACK_NAME,
  STAR_PANELS,
  geneOrderStarUrl,
  orthologPaf,
} from './geneOrderStar.ts'

import type { TaxonNode } from './multiSyntenyTaxonTree.ts'
import type { PlacedGene } from './neighborhood.ts'

function paramsOf(url: string) {
  const u = new URL(url)
  return new URLSearchParams(u.hash ? u.hash.slice(1) : u.search)
}

interface StarLane {
  rows: { kept: string[] }
}

interface IndexedChain {
  pifGzLocation: { uri: string }
  index: { location: { uri: string } }
}

interface StarSessionTrack {
  name: string
  adapter: {
    adapters: [
      IndexedChain & { pafLocation: { uri: string } },
      ...(IndexedChain & { pafLocation?: { uri: string } })[],
    ]
  }
  displays: [{ laneGeneTracks: string[] }]
}

interface StarSession {
  views: [{ loc: string; tracks: [StarLane, ...StarLane[]] }]
  sessionTracks: [StarSessionTrack, ...StarSessionTrack[]]
}

function sessionOf(url: string) {
  const session: unknown = JSON.parse(
    paramsOf(url)
      .get('session')!
      .replace(/^spec-/, ''),
  )
  return session as StarSession
}

const LOC = 'NC_000011.10:5219561-5349427'
const panel = STAR_PANELS.hg38!
const starOf = (
  mates: string[],
  chain = (mate: string) => `liftOver/${mate}.pif.gz`,
) => ({
  hg38: {
    mates,
    chains: Object.fromEntries(mates.map(mate => [mate, chain(mate)])),
    taxa: {},
  },
})
const stars = starOf([...panel, 'hg19'])

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
const zebrafish = {
  taxonId: 7955,
  genes: [gene('7157', 'GCF_052040795.2', 'NC_141025.1', 25130001)],
}
const hosted = (accession: string) => ({ accession, exact: true })

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

test("an aligned lane reads the chain the star names, beside the reference's config", () => {
  const star = geneOrderStarUrl({
    ref: 'hg38',
    loc: LOC,
    stars: starOf(['mm39', 'rn7'], mate =>
      mate === 'mm39'
        ? 'liftOver/anyName.pif.gz'
        : 'https://example.org/chains/rn7.pif.gz',
    ),
  })!
  assert.deepEqual(
    sessionOf(star.url).sessionTracks[0].adapter.adapters.map(a => [
      a.pifGzLocation.uri,
      a.index.location.uri,
    ]),
    [
      [
        'https://jbrowse.org/ucsc/hg38/liftOver/anyName.pif.gz',
        'https://jbrowse.org/ucsc/hg38/liftOver/anyName.pif.gz.csi',
      ],
      [
        'https://example.org/chains/rn7.pif.gz',
        'https://example.org/chains/rn7.pif.gz.csi',
      ],
    ],
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

test('chicken and zebrafish, where NCBI places the gene, move to NCBI ortholog lanes', () => {
  const star = geneOrderStarUrl({
    ref: 'hg38',
    loc: LOC,
    stars,
    species: [chicken, zebrafish],
    refGenes,
    queryId: '7157',
    hosted,
  })!
  const { views, sessionTracks } = sessionOf(star.url)
  assert.equal(star.genomes, panel.length)
  assert.ok(!views[0].tracks[0].rows.kept.includes('galGal6'))
  const ortholog = sessionTracks[1]
  assert.ok(ortholog)
  assert.equal(ortholog.name, ORTHOLOG_TRACK_NAME)
  assert.deepEqual(views[0].tracks[1]?.rows.kept, [
    'GCF_016699485.2',
    'GCF_052040795.2',
  ])
  const paf = atob(
    ortholog.adapter.adapters[0].pafLocation.uri.split(',')[1] ?? '',
  )
  assert.equal(paf.trim().split('\n').length, 1)
})

// JBrowse reads a star's anchor as the one assembly all its children name, and
// refuses a track of one child, which names two.
test('a lone NCBI lane shares one track with the aligned lanes', () => {
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
  assert.equal(sessionTracks.length, 1)
  assert.equal(sessionTracks[0].name, MIXED_TRACK_NAME)
  assert.equal(sessionTracks[0].adapter.adapters.length, panel.length)
  assert.deepEqual(views[0].tracks[0].rows.kept, [
    ...panel.filter(m => m !== 'galGal6'),
    'GCF_016699485.2',
  ])
  assert.match(
    sessionTracks[0].adapter.adapters.at(-1)?.pafLocation?.uri ?? '',
    /^data:text\/plain;base64,/,
  )
})

test('a panel of one lane is no launch', () => {
  assert.equal(
    geneOrderStarUrl({
      ref: 'hg38',
      loc: LOC,
      stars: starOf(['mm39']),
    }),
    undefined,
  )
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
    stars: starOf(['mm39', 'galGal6']),
  })!
  assert.deepEqual(sessionOf(star.url).views[0].tracks[0].rows.kept, [
    'mm39',
    'galGal6',
  ])
})

const chainsOf = (mates: string[]) =>
  Object.fromEntries(mates.map(mate => [mate, `liftOver/${mate}.pif.gz`]))
const mouseMates = ['hg38', 'mm10', 'rn7', 'galGal6', 'canFam6']
const mouseStars = {
  mm39: {
    mates: mouseMates,
    chains: chainsOf(mouseMates),
    taxa: {
      '9031': 'galGal6',
      '9606': 'hg38',
      '9615': 'canFam6',
      '10090': 'mm10',
      '10116': 'rn7',
    },
  },
}

test('a reference with no panel of its own opens its star, model organisms first', () => {
  const star = geneOrderStarUrl({
    ref: 'mm39',
    loc: LOC,
    stars: mouseStars,
    refTaxonId: 10090,
  })!
  assert.equal(star.genomes, 4)
  assert.deepEqual(sessionOf(star.url).views[0].tracks[0].rows.kept, [
    'hg38',
    'rn7',
    'galGal6',
    'canFam6',
  ])
  assert.match(paramsOf(star.url).get('config')!, /^\/ucsc\/mm39\//)
})

const leaf = (taxonId: number): TaxonNode => ({
  taxonId,
  name: String(taxonId),
  children: [],
})
const clade = (taxonId: number, children: TaxonNode[]): TaxonNode => ({
  taxonId,
  name: String(taxonId),
  children,
})

// ((mouse, rat), human), chicken: dog is a lane the page's tree does not place
test('a species panel runs nearest the reference first', () => {
  const star = geneOrderStarUrl({
    ref: 'mm39',
    loc: LOC,
    stars: mouseStars,
    refTaxonId: 10090,
    tree: clade(1, [
      leaf(9031),
      clade(2, [leaf(9606), clade(3, [leaf(10116), leaf(10090)])]),
    ]),
  })!
  assert.deepEqual(sessionOf(star.url).views[0].tracks[0].rows.kept, [
    'rn7',
    'hg38',
    'galGal6',
    'canFam6',
  ])
})

// Mouse Hbb-bt: NCBI lists no rat ortholog, so the tree has no rat, and the
// chain places it all the same
test('a species the tree lacks joins a last ring, model organisms first', () => {
  const taxa = Object.fromEntries(
    [9986, 9258, 9371, 10116, 13616].map(t => [String(t), `asm${t}`]),
  )
  const star = geneOrderStarUrl({
    ref: 'mm39',
    loc: LOC,
    stars: {
      mm39: {
        mates: Object.values(taxa),
        chains: chainsOf(Object.values(taxa)),
        taxa,
      },
    },
    refTaxonId: 10090,
    tree: clade(1, [leaf(9986), leaf(10090)]),
  })!
  assert.deepEqual(
    sessionOf(star.url).views[0].tracks[0].rows.kept.slice(0, 2),
    ['asm9986', 'asm10116'],
  )
})

// 30 near relatives and 3 far species: a slice of the nearest twelve would
// hold no far one
test('a species panel of twelve takes a share from every ring of kinship', () => {
  const near = Array.from({ length: 30 }, (_, i) => 100 + i)
  const far = [900, 901, 902]
  const taxa = Object.fromEntries(
    [...near, ...far].map(t => [String(t), `asm${t}`]),
  )
  const star = geneOrderStarUrl({
    ref: 'dm6',
    loc: LOC,
    stars: {
      dm6: {
        mates: Object.values(taxa),
        chains: chainsOf(Object.values(taxa)),
        taxa,
      },
    },
    refTaxonId: 7227,
    tree: clade(1, [
      ...far.map(leaf),
      clade(2, [leaf(7227), ...near.map(leaf)]),
    ]),
  })!
  const lanes = sessionOf(star.url).views[0].tracks[0].rows.kept
  assert.equal(star.genomes, 12)
  assert.equal(lanes.filter(l => l >= 'asm900').length, 3)
  assert.equal(lanes[0]?.startsWith('asm1'), true)
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
      stars: starOf(['hg19']),
    }),
    undefined,
  )
})
