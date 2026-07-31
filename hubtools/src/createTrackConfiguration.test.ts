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

function aggregateFieldOf(conf: ReturnType<typeof createTrackConfiguration>) {
  const adapter = conf?.adapter
  return adapter && 'aggregateField' in adapter
    ? adapter.aggregateField
    : undefined
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
    assert.equal(aggregateFieldOf(conf), 'name2')
  })

  it('falls back to first labelFields when no default', () => {
    const conf = build({
      track: 'ncbiRefSeq',
      type: 'bigGenePred',
      bigDataUrl: 'ncbiRefSeq.bb',
      shortLabel: 'RefSeq All',
      labelFields: 'geneName,geneName2',
    })
    assert.equal(aggregateFieldOf(conf), 'geneName')
  })

  it('leaves aggregateField unset for non-bigGenePred big tracks', () => {
    const conf = build({
      track: 'someBigBed',
      type: 'bigBed',
      bigDataUrl: 'someBigBed.bb',
      shortLabel: 'Some bigBed',
      defaultLabelFields: 'name',
    })
    assert.equal(aggregateFieldOf(conf), undefined)
  })
})

function mafAdapterOf(conf: ReturnType<typeof createTrackConfiguration>) {
  const adapter = conf?.adapter
  return adapter && 'bigBedLocation' in adapter ? adapter : undefined
}

const mafTrackDb = {
  track: 'bigMaf',
  type: 'bigMaf',
  bigDataUrl: 'maf/hg38.bigMaf.bb',
  shortLabel: 'Alignment',
  summary: 'maf/hg38.bigMafSummary.bb',
  frames: 'maf/hg38.bigMafFrames.bb',
  speciesOrder: 'mm10 rn6',
}

describe('createTrackConfiguration bigMaf wiring', () => {
  it('wires frames as the annotation sub-adapter', () => {
    const adapter = mafAdapterOf(build(mafTrackDb))
    assert.deepEqual(adapter?.annotationAdapter, {
      type: 'BigBedAdapter',
      bigBedLocation: {
        uri: 'https://example.com/hub/hg38/maf/hg38.bigMafFrames.bb',
      },
    })
  })

  it('emits speciesOrder as samples, reference genome first', () => {
    const adapter = mafAdapterOf(build(mafTrackDb))
    assert.deepEqual(adapter?.samples, [
      { id: 'hg38', label: 'hg38' },
      { id: 'mm10', label: 'mm10' },
      { id: 'rn6', label: 'rn6' },
    ])
  })

  it('omits samples entirely when the hub gives no speciesOrder', () => {
    const { speciesOrder: _speciesOrder, ...noOrder } = mafTrackDb
    assert.equal(mafAdapterOf(build(noOrder))?.samples, undefined)
  })
})
