import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { withTrackDbMetadata } from './trackDbMetadata.ts'

import type { TrackDbEntry, UcscTrack } from './types.ts'

function entry(tableName: string, html: string, parent?: string): TrackDbEntry {
  return {
    tableName,
    settings: [
      `track ${tableName}`,
      `html ${tableName}`,
      ...(parent ? [`parent ${parent}`] : []),
    ].join('\n'),
    html,
    longLabel: `${tableName} long`,
    grp: 'map',
    shortLabel: tableName,
    type: 'bigBed 6',
  }
}

const tracksDb = {
  mappability: entry('mappability', '<h2>Description</h2>'),
  umap: entry('umap', '<h2>Description</h2>\n<p>Umap</p>', 'mappability'),
  umap24: entry('umap24', '', 'umap'),
  blank: entry('blank', ' \n'),
}

function track(table: string): UcscTrack {
  return {
    type: 'FeatureTrack',
    trackId: `hg38-${table}`,
    name: table,
    assemblyNames: ['hg38'],
    adapter: { type: 'BigBedAdapter' },
  }
}

function ucscOf(table: string) {
  return withTrackDbMetadata(track(table), tracksDb).metadata?.ucsc
}

describe('withTrackDbMetadata', () => {
  it('links the description page of a track with trackDb prose, in place of the html setting', () => {
    assert.deepEqual(ucscOf('umap'), {
      track: 'umap',
      parent: 'mappability',
      html: '<a href="https://jbrowse.org/ucsc/hg38/descriptions/umap.html">Track description</a>',
    })
  })

  it('links nothing for a track whose trackDb html is empty or blank', () => {
    assert.deepEqual(ucscOf('umap24'), { track: 'umap24', parent: 'umap' })
    assert.deepEqual(ucscOf('blank'), { track: 'blank' })
  })

  it('leaves a track with no trackDb entry as it was', () => {
    assert.deepEqual(
      withTrackDbMetadata(track('ours'), tracksDb),
      track('ours'),
    )
  })
})
