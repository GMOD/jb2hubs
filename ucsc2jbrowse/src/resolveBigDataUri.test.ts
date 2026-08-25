import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolveBigDataUri } from './resolveBigDataUri.ts'

const baseUrl = 'https://hgdownload.soe.ucsc.edu'
const resolve = (bigDataUrl: string) =>
  resolveBigDataUri({ bigDataUrl, baseUrl })

describe('resolveBigDataUri', () => {
  it('prefixes a root-absolute trackDb path', () => {
    assert.equal(
      resolve('/gbdb/hg38/gnomAD/v4.1/genomes/genomes.bb'),
      `${baseUrl}/gbdb/hg38/gnomAD/v4.1/genomes/genomes.bb`,
    )
  })

  it('leaves a full url on the same host alone', () => {
    const url = `${baseUrl}/goldenPath/hg38/multiz470way/multiz470way.bigMaf`
    assert.equal(resolve(url), url)
  })

  // hg38-cactus447way, verbatim. The old rule tested startsWith(baseUrl), so a
  // full url on any OTHER host was treated as a path and got the base
  // concatenated onto its front -- shipping
  // `https://hgdownload.soe.ucsc.eduhttps://hgdownload-test…`, which resolves
  // to nothing and was the one mangled location in all 238 configs.
  it('leaves a full url on a different host alone', () => {
    const url =
      'https://hgdownload-test.gi.ucsc.edu/goldenPath/hg38/cactus447way/hg38.cactus447way.bb'
    assert.equal(resolve(url), url)
    assert.ok(
      !resolve(url).startsWith(`${baseUrl}https`),
      'the base must not be prefixed onto an absolute url',
    )
  })

  it('accepts http as well as https', () => {
    const url = 'http://hgdownload.soe.ucsc.edu/gbdb/hg19/bbi/thing.bw'
    assert.equal(resolve(url), url)
  })

  // A host whose name merely starts with the base's would slip past a
  // startsWith test on the other side of the same bug.
  it('does not confuse a lookalike host for the base', () => {
    const url = 'https://hgdownload.soe.ucsc.edu.example.com/evil.bb'
    assert.equal(resolve(url), url)
  })
})
