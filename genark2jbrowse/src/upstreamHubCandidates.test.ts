import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { candidatePaths, manifestAccessions } from './upstreamHubCandidates.ts'

describe('manifestAccessions', () => {
  it('takes a hub accession from its own top-level hub.txt', () => {
    assert.deepEqual(
      manifestAccessions(
        [
          'GCA/000/001/905/GCA_000001905.1/hub.txt',
          'GCF/937/001/465/GCF_937001465.1/hub.txt',
        ].join('\n'),
      ),
      ['GCA_000001905.1', 'GCF_937001465.1'],
    )
  })

  // 6 of the 52,728 hub.txt paths in the manifest are archived annotation
  // runs, which are not hubs we publish and have no 2bit beside them.
  it('ignores an archived hub.txt and every other file', () => {
    assert.deepEqual(
      manifestAccessions(
        [
          'GCF/937/001/465/GCF_937001465.1/archive/ncbiGene/2022-08-03/hub.txt',
          'GCA/000/001/905/GCA_000001905.1/GCA_000001905.1.2bit',
          'GCA/000/001/905/GCA_000001905.1/bbi/GCA_000001905.1.gc5Base.bw',
          'GCA/000/001/905/GCA_000001905.1/hub.txt.bak',
        ].join('\n'),
      ),
      [],
    )
  })
})

describe('candidatePaths', () => {
  it('asks for the three files a hub config needs, module-relative', () => {
    assert.deepEqual(candidatePaths(['GCF_000001405.40']), [
      'GCF/000/001/405/GCF_000001405.40/GCF_000001405.40.2bit',
      'GCF/000/001/405/GCF_000001405.40/GCF_000001405.40.chrom.sizes.txt',
      'GCF/000/001/405/GCF_000001405.40/hub.txt',
    ])
  })

  it('dedupes accessions the three sources all name', () => {
    const acc = 'GCA_000001905.1'
    assert.equal(candidatePaths([acc, acc, acc]).length, 3)
  })

  // The assembly list carries names that are not accessions at all; one of
  // them must not take the run down.
  it('skips a name with no accession shape', () => {
    assert.deepEqual(candidatePaths(['hg38', 'GC_1', '']), [])
  })
})
