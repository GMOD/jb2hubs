import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { trixAdapter, trixIndexOf } from './trixAdapter.ts'

describe('trixAdapter', () => {
  it('names the index files and nothing a v5 host does not read', () => {
    assert.deepEqual(Object.keys(trixAdapter('hg38')), [
      'type',
      'ixFilePath',
      'ixxFilePath',
      'assemblyNames',
    ])
  })

  it('is one index with any other adapter naming the same .ix', () => {
    const cli = {
      type: 'TrixTextSearchAdapter',
      ixFilePath: { uri: 'trix/hg38.ix' },
      assemblyNames: ['hg38'],
    }
    assert.equal(trixIndexOf(trixAdapter('hg38')), trixIndexOf(cli))
    assert.notEqual(trixIndexOf(trixAdapter('mm39')), trixIndexOf(cli))
  })
})
