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

// UCSC types both a multiz/cactus alignment and a chainNet net `bigMaf`, so the
// rules that tell them apart only fire on this type.
function bigMaf(trackId: string, assembly = 'hg38') {
  return {
    name: trackId,
    assemblyNames: [assembly],
    metadata: { ucsc: { track: trackId, type: 'bigMaf' } },
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

  // Dropped for the file's block granularity, not for its depth: the other two
  // hg38 bigMafs are deeper (445 and 319 species against 217) and both stay,
  // because they open at base zoom and hand over to their summary tier further
  // out. Asserting all three together is the point of the test, since a rule
  // that quietly widened to "deep alignment" would take the working ones too.
  it('drops the bigMaf that opens at no zoom, and keeps the two that do', () => {
    assert.equal(getTrackModifications(bigMaf('cactus241wayBM')), undefined)
    for (const id of ['multiz470way', 'cactus447way']) {
      assert.equal(getTrackModifications(bigMaf(id))?.name, id, id)
    }
  })

  // UCSC types a chainNet net `bigMaf` too, so the only thing separating a
  // pairwise net from a real multiple alignment is the subtrack name. Both
  // families are asserted together because a rule keyed on "bigMaf" alone would
  // take multiz/cactus with it, and one keyed too loosely on "net" would not.
  it('drops chainNet nets typed bigMaf, keeping the real alignments', () => {
    for (const id of [
      'netGCF_016699485.2',
      'rbestNetGCF_016699485.2',
      'synNetGCF_016699485.2',
      'netGCF_003668045.3',
      'netHg38',
    ]) {
      assert.equal(getTrackModifications(bigMaf(id)), undefined, id)
    }
    for (const id of ['multiz470way', 'cactus447way']) {
      assert.equal(getTrackModifications(bigMaf(id))?.name, id, id)
    }
  })

  it('prefixes gnomAD track names', () => {
    assert.equal(
      getTrackModifications(track('gnomadGenomesVariantsV4_1', 'v4.1 Genomes'))
        ?.name,
      'gnomAD v4.1 Genomes',
    )
  })
})
