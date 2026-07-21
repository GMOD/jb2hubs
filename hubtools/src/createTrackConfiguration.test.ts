import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createTrackConfiguration } from './createTrackConfiguration.ts'

import type { RaStanza, TrackDbFile } from '@gmod/ucsc-hub'

const sequenceAdapter = { type: 'TwoBitAdapter', uri: 'seq.2bit' }
const trackDbUrl = 'https://example.com/hub/hg38/trackDb.txt'

function build(data: Record<string, string>) {
  const track = { name: data.track, data } as unknown as RaStanza
  const trackDb = { data: { [data.track!]: track } } as unknown as TrackDbFile
  return createTrackConfiguration({
    track,
    trackName: data.track!,
    trackDb,
    trackDbUrl,
    sequenceAdapter,
    assemblyName: 'hg38',
  })
}

describe('createTrackConfiguration aggregateField derivation', () => {
  it('sets aggregateField from defaultLabelFields for bigGenePred', () => {
    const conf = build({
      track: 'ncbiRefSeq',
      type: 'bigGenePred',
      bigDataUrl: 'ncbiRefSeq.bb',
      shortLabel: 'RefSeq All',
      labelFields: 'name2,geneName,geneName2',
      defaultLabelFields: 'name2',
    })
    assert.equal(conf?.adapter.aggregateField, 'name2')
  })

  it('falls back to first labelFields when no default', () => {
    const conf = build({
      track: 'ncbiRefSeq',
      type: 'bigGenePred',
      bigDataUrl: 'ncbiRefSeq.bb',
      shortLabel: 'RefSeq All',
      labelFields: 'geneName,geneName2',
    })
    assert.equal(conf?.adapter.aggregateField, 'geneName')
  })

  it('leaves aggregateField unset for non-bigGenePred big tracks', () => {
    const conf = build({
      track: 'someBigBed',
      type: 'bigBed',
      bigDataUrl: 'someBigBed.bb',
      shortLabel: 'Some bigBed',
      defaultLabelFields: 'name',
    })
    assert.equal(conf?.adapter.aggregateField, undefined)
  })
})
