import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { addTrixAdapterIds, trixAdapter, trixIndexOf } from './trixAdapter.ts'

describe('trixAdapter', () => {
  it('carries the id v4.3.0 needs to boot', () => {
    assert.deepEqual(Object.keys(trixAdapter('hg38')), [
      'type',
      'textSearchAdapterId',
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

  it("puts back the id the CLI's rewrite drops", () => {
    const config = {
      aggregateTextSearchAdapters: [
        {
          type: 'TrixTextSearchAdapter',
          ixFilePath: { uri: 'trix/hg38.ix' },
          assemblyNames: ['hg38'],
        },
        trixAdapter('mm39'),
      ],
    }
    assert.equal(addTrixAdapterIds(config), 1)
    assert.deepEqual(
      config.aggregateTextSearchAdapters.map(a => a.textSearchAdapterId),
      ['hg38-index', 'mm39-index'],
    )
  })
})
