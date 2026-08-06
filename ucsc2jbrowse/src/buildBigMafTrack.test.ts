import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildBigMafTrack } from './buildBigMafTrack.ts'

const baseUrl = 'https://hgdownload.soe.ucsc.edu'

// Real hg38 trackDb settings, verbatim. multiz470way spells its sidecars as
// full urls and cactus241way spells its summary as a bare /gbdb path, in the
// same trackDb — which is the whole reason resolution is not a string concat.
//
// Without CHECK_404 (make.sh sets it; its path needs the network)
// checkIfFileAccessible is the identity, so these exercise resolution only.
const multiz470way = {
  longLabel: '470 mammals alignment',
  speciesLabels:
    'HLnomLeu4="northern white-cheeked gibbon" HLmacFas6="crab-eating macaque"',
  summary: `${baseUrl}/goldenPath/hg38/multiz470way/multiz470waySummary.bb`,
  frames: `${baseUrl}/goldenPath/hg38/multiz470way/multiz470wayFrames.bb`,
}
const cactus241way = {
  longLabel: 'Cactus 241-way',
  speciesLabels: 'Acinonyx_jubatus="cheetah"',
  summary: '/gbdb/hg38/cactus241way/tinySummary.bb',
  frames: `${baseUrl}/goldenPath/hg38/cactus241way/cactus241wayFrames.bb`,
}

function build(settings: Record<string, string>) {
  return buildBigMafTrack({
    trackId: 'hg38-multiz470way',
    tableName: 'multiz470way',
    assemblyName: 'hg38',
    uri: `${baseUrl}/goldenPath/hg38/multiz470way/multiz470way.bigMaf`,
    baseUrl,
    settings,
  })
}

describe('buildBigMafTrack', () => {
  it('wires the summary and frames sidecars trackDb names', async () => {
    const { adapter } = await build(multiz470way)
    assert.deepEqual(adapter.summaryAdapter, {
      type: 'BigBedAdapter',
      bigBedLocation: {
        uri: `${baseUrl}/goldenPath/hg38/multiz470way/multiz470waySummary.bb`,
      },
    })
    assert.deepEqual(adapter.annotationAdapter, {
      type: 'BigBedAdapter',
      bigBedLocation: {
        uri: `${baseUrl}/goldenPath/hg38/multiz470way/multiz470wayFrames.bb`,
      },
    })
  })

  it('resolves a bare hgdownload path, leaving one that names a host alone', async () => {
    const { adapter } = await build(cactus241way)
    assert.deepEqual(adapter.summaryAdapter, {
      type: 'BigBedAdapter',
      bigBedLocation: {
        uri: `${baseUrl}/gbdb/hg38/cactus241way/tinySummary.bb`,
      },
    })
    assert.deepEqual(adapter.annotationAdapter, {
      type: 'BigBedAdapter',
      bigBedLocation: {
        uri: `${baseUrl}/goldenPath/hg38/cactus241way/cactus241wayFrames.bb`,
      },
    })
  })

  it('omits a slot the trackDb has no setting for, rather than nulling it', async () => {
    const { adapter } = await build({ longLabel: 'no sidecars' })
    assert.equal('summaryAdapter' in adapter, false)
    assert.equal('annotationAdapter' in adapter, false)
  })

  it('keeps the shape the rest of the pipeline expects', async () => {
    const track = await build(multiz470way)
    assert.equal(track.type, 'MafTrack')
    assert.equal(track.adapter.type, 'BigMafAdapter')
    assert.deepEqual(track.assemblyNames, ['hg38'])
    assert.deepEqual(track.adapter.bigBedLocation, {
      uri: `${baseUrl}/goldenPath/hg38/multiz470way/multiz470way.bigMaf`,
    })
    assert.deepEqual(track.adapter.samples, [
      { id: 'HLnomLeu4', label: 'northern white-cheeked gibbon' },
      { id: 'HLmacFas6', label: 'crab-eating macaque' },
    ])
  })
})
