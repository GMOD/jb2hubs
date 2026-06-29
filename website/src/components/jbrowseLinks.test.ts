import assert from 'node:assert'
import { test } from 'node:test'

import { mergeConfig, specUrl } from './jbrowseLinks.ts'
import { orthoSyntenyUrl } from './orthologSearchUtils.ts'

import type { OrthologResult } from './orthologSearchUtils.ts'

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
  jbrowseUrl: 'x',
}

const refResult: OrthologResult = {
  ...result,
  assembly: { ...result.assembly, accession: 'GCF_REF' },
  begin: 5,
  end: 9,
  locStr: 'NC_REF:5-9',
}

test('orthoSyntenyUrl windows both panels around their genes', () => {
  const views = sessionOf(
    orthoSyntenyUrl('GCF_REF', result, 'track1', refResult, 10),
  ).views[0].views
  assert.deepEqual(views, [
    { assembly: 'GCF_ORTHO', loc: 'NC_1:90-210' },
    // begin - flank clamps at 1 rather than going negative
    { assembly: 'GCF_REF', loc: 'NC_REF:1-19' },
  ])
})

test('orthoSyntenyUrl leaves the reference panel unnavigated when no ref row', () => {
  const views = sessionOf(
    orthoSyntenyUrl('GCF_REF', result, 'track1', undefined),
  ).views[0].views
  assert.deepEqual(views[1], { assembly: 'GCF_REF' })
})
