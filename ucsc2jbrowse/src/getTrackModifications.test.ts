import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getTrackModifications } from './getTrackModifications.ts'

function track(trackId: string, name = trackId, assembly = 'hg19') {
  return {
    name,
    assemblyNames: [assembly],
    metadata: { ucsc: { track: trackId, type: 'bigWig' } },
  }
}

describe('getTrackModifications', () => {
  it('drops an ENCODE experiment track by its prefix', () => {
    assert.equal(
      getTrackModifications(track('wgEncodeBroadHistoneH3k4me3')),
      undefined,
    )
    assert.equal(getTrackModifications(track('encodeCcreCombined')), undefined)
  })

  // The prefix rule exists to keep ENCODE's per-experiment composites out, and
  // it was also taking hg19's only mappability tracks with it — the annotation
  // that says whether a read can be placed at a locus, which hg38 keeps under
  // names the rule never matched (Umap/Bismap). Both families are asserted
  // here, since the value of the exemption is that it did not widen.
  it('keeps the CRG and Duke mappability tracks despite the prefix', () => {
    for (const id of [
      'wgEncodeCrgMapabilityAlign24mer',
      'wgEncodeCrgMapabilityAlign36mer',
      'wgEncodeCrgMapabilityAlign40mer',
      'wgEncodeCrgMapabilityAlign50mer',
      'wgEncodeCrgMapabilityAlign75mer',
      'wgEncodeCrgMapabilityAlign100mer',
      'wgEncodeDukeMapabilityUniqueness20bp',
      'wgEncodeDukeMapabilityUniqueness35bp',
    ]) {
      assert.equal(getTrackModifications(track(id))?.name, id, id)
    }
  })

  // Neighbours of the kept set that are still experiments: the exemption is a
  // literal id list rather than a `Mapability` substring, so the excludable-
  // region BEDs beside them stay dropped by the same rule (they are already
  // covered on hg19 by the Problematic Regions group).
  it('does not exempt the rest of the Mapability group', () => {
    assert.equal(
      getTrackModifications(track('wgEncodeDukeMapabilityRegionsExcludable')),
      undefined,
    )
  })

  it('prefixes gnomAD track names', () => {
    assert.equal(
      getTrackModifications(track('gnomadGenomesVariantsV4_1', 'v4.1 Genomes'))
        ?.name,
      'gnomAD v4.1 Genomes',
    )
  })
})
