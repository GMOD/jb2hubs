import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { inheritedTrackDbSetting } from './utils/trackDbSettings.ts'

import type { TrackDbEntry } from './types.ts'

function entry(tableName: string, settings: string) {
  return { tableName, settings } as TrackDbEntry
}

describe('inheritedTrackDbSetting', () => {
  const tracksDb = {
    uniprot: entry('uniprot', 'compositeTrack on\nexonNumbers off'),
    unipDomain: entry('unipDomain', 'parent uniprot\ntype bigBed 12 +'),
    unipMut: entry('unipMut', 'parent uniprot on\nexonNumbers on'),
    spMut: entry('spMut', 'type bigBed 12 +'),
  }

  it("reads a parent's setting through `parent <track> on`", () => {
    assert.equal(
      inheritedTrackDbSetting(tracksDb, 'unipDomain', 'exonNumbers'),
      'off',
    )
  })

  it('prefers the track’s own setting', () => {
    assert.equal(
      inheritedTrackDbSetting(tracksDb, 'unipMut', 'exonNumbers'),
      'on',
    )
  })

  it('is undefined when no stanza sets it', () => {
    assert.equal(
      inheritedTrackDbSetting(tracksDb, 'spMut', 'exonNumbers'),
      undefined,
    )
  })
})
