import assert from 'node:assert'
import { test } from 'node:test'

import { mergeConfig, specUrl, syntenyViewUrl } from './jbrowseLinks.ts'
import { orthoSyntenyUrl } from './orthologSearchUtils.ts'

import type { OrthologResult } from './orthologSearchUtils.ts'
import type { SyntenyLink } from './syntenyPairIndex.ts'

// Pull the decoded session object back out of a launch URL.
function sessionOf(url: string) {
  const spec = new URL(url).searchParams.get('session')!
  return JSON.parse(spec.replace(/^spec-/, ''))
}

test('mergeConfig joins hub ids onto the merge endpoint', () => {
  assert.equal(
    mergeConfig(['hg38', 'GCA_1']),
    'https://0hifvzakej.execute-api.us-east-1.amazonaws.com/merge?hubIds=hg38,GCA_1',
  )
})

test('specUrl encodes the config and wraps views in a spec- session', () => {
  const url = specUrl('https://x/config.json', [
    { type: 'LinearGenomeView', assembly: 'hg38' },
  ])
  assert.match(url, /config=https%3A%2F%2Fx%2Fconfig\.json/)
  assert.deepEqual(sessionOf(url), {
    views: [{ type: 'LinearGenomeView', assembly: 'hg38' }],
  })
})

const result: OrthologResult = {
  assembly: {
    accession: 'GCF_ORTHO',
    commonName: 'mouse',
    scientificName: 'Mus musculus',
    taxonId: 10090,
  },
  geneSymbol: 'Brca1',
  geneId: '12189',
  chromosome: '11',
  begin: 100,
  end: 200,
  locStr: 'NC_1:100-200',
  strand: 1,
  jbrowseUrl: 'x',
}

const refResult: OrthologResult = {
  ...result,
  assembly: { ...result.assembly, accession: 'GCF_REF' },
  begin: 5,
  end: 9,
  locStr: 'NC_REF:5-9',
}

const link: SyntenyLink = {
  trackId: 'track1',
  names: ['GCF_ORTHO', 'GCF_REF'],
  geneTracks: ['GCF_ORTHO-ncbiGff', 'GCF_REF-ncbiGff'],
}

test('orthoSyntenyUrl windows both panels around their genes', () => {
  const views = sessionOf(orthoSyntenyUrl(result, link, refResult, 10)).views[0]
    .views
  assert.deepEqual(views, [
    {
      assembly: 'GCF_ORTHO',
      loc: 'NC_1:90-210',
      tracks: ['GCF_ORTHO-ncbiGff'],
    },
    // begin - flank clamps at 1 rather than going negative
    { assembly: 'GCF_REF', loc: 'NC_REF:1-19', tracks: ['GCF_REF-ncbiGff'] },
  ])
})

// Same rule as the multi-species stack, on two rows: this row leads, so it is
// the reference panel that flips. Without it a chimp-vs-human BRCA1 launch draws
// the human panel back-to-front and the one ribbon crosses the strip.
test('orthoSyntenyUrl flips the reference panel when the strands disagree', () => {
  const views = sessionOf(
    orthoSyntenyUrl(result, link, { ...refResult, strand: -1 }, 10),
  ).views[0].views
  assert.equal(views[0].loc, 'NC_1:90-210')
  assert.equal(views[1].loc, 'NC_REF:1-19[rev]')
})

test('orthoSyntenyUrl flips nothing when both rows agree, whichever strand', () => {
  const both = (strand: 1 | -1) =>
    sessionOf(
      orthoSyntenyUrl(
        { ...result, strand },
        link,
        { ...refResult, strand },
        10,
      ),
    ).views[0].views.map((v: { loc: string }) => v.loc)
  assert.deepEqual(both(1), ['NC_1:90-210', 'NC_REF:1-19'])
  assert.deepEqual(both(-1), ['NC_1:90-210', 'NC_REF:1-19'])
})

test('orthoSyntenyUrl leaves the reference panel unnavigated when no ref row', () => {
  const views = sessionOf(orthoSyntenyUrl(result, link, undefined)).views[0]
    .views
  assert.deepEqual(views[1], {
    assembly: 'GCF_REF',
    tracks: ['GCF_REF-ncbiGff'],
  })
})

// The panels are named by the link, not by the accessions: the human half of a
// comparison lives in /ucsc/hg38/config.json under the name hg38, and merging
// GCF_000001405.40 instead would fetch a hub the track is not in.
test('orthoSyntenyUrl names each panel the way its synteny track does', () => {
  const views = sessionOf(
    orthoSyntenyUrl(
      result,
      {
        trackId: 'canFam3_to_hg38_liftOver',
        names: ['canFam3', 'hg38'],
        geneTracks: ['canFam3-ncbiRefSeq', 'hg38-ncbiRefSeq'],
      },
      refResult,
      10,
    ),
  ).views[0].views
  assert.deepEqual(views, [
    { assembly: 'canFam3', loc: 'NC_1:90-210', tracks: ['canFam3-ncbiRefSeq'] },
    { assembly: 'hg38', loc: 'NC_REF:1-19', tracks: ['hg38-ncbiRefSeq'] },
  ])
})

// The indel wedges are noise at ortholog-window scale. Ignored outright by the
// released host's launcher (measured 2026-08-27), which is why it is passed
// unconditionally rather than gated — it starts working when v5 publishes.
test('every synteny launch turns CIGAR indels off by default', () => {
  const spec = sessionOf(
    syntenyViewUrl([{ assembly: 'hg38' }, { assembly: 'mm39' }], ['t']),
  ).views[0]
  assert.equal(spec.cigarMode, 'off')
})

test('a caller can override the default', () => {
  const spec = sessionOf(
    syntenyViewUrl([{ assembly: 'hg38' }, { assembly: 'mm39' }], ['t'], {
      cigarMode: 'full',
      drawCurves: true,
    }),
  ).views[0]
  assert.equal(spec.cigarMode, 'full')
  assert.equal(spec.drawCurves, true)
})
