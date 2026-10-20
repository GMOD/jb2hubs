import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { restoreTrixAdapters } from './trixAdapter.ts'

const loc = (uri: string) => ({ uri, locationType: 'UriLocation' })

describe('restoreTrixAdapters', () => {
  it("puts back the id and meta file the CLI's rewrite drops", () => {
    const config = {
      aggregateTextSearchAdapters: [
        {
          type: 'TrixTextSearchAdapter',
          ixFilePath: loc('trix/hg38.ix'),
          ixxFilePath: loc('trix/hg38.ixx'),
          assemblyNames: ['hg38'],
        },
      ],
    }
    assert.equal(restoreTrixAdapters(config), 1)
    assert.deepEqual(config.aggregateTextSearchAdapters, [
      {
        type: 'TrixTextSearchAdapter',
        textSearchAdapterId: 'hg38-index',
        ixFilePath: loc('trix/hg38.ix'),
        ixxFilePath: loc('trix/hg38.ixx'),
        metaFilePath: loc('trix/hg38_meta.json'),
        assemblyNames: ['hg38'],
      },
    ])
    assert.deepEqual(Object.keys(config.aggregateTextSearchAdapters[0]!), [
      'type',
      'textSearchAdapterId',
      'ixFilePath',
      'ixxFilePath',
      'metaFilePath',
      'assemblyNames',
    ])
  })

  it('leaves a complete adapter, another type and a config without any alone', () => {
    const complete = {
      type: 'TrixTextSearchAdapter',
      textSearchAdapterId: 'custom',
      ixFilePath: loc('trix/x.ix'),
    }
    const other = { type: 'JBrowse1TextSearchAdapter', namesIndexLocation: {} }
    const config = { aggregateTextSearchAdapters: [complete, other] }
    assert.equal(restoreTrixAdapters(config), 0)
    assert.deepEqual(config.aggregateTextSearchAdapters, [complete, other])
    const none = {}
    assert.equal(restoreTrixAdapters(none), 0)
    assert.deepEqual(none, {})
  })
})
