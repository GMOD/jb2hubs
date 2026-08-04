import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { shouldIncludeTrack } from './createMinimalConfig.ts'

// minimal.json is what @cmdcolin/jbrowse-plugin-hubs fetches to resolve a genome
// a synteny track references, so what this predicate lets through is both the
// size of that fetch and what the mate panel opens with.
describe('shouldIncludeTrack', () => {
  it('keeps the four track groups minimal configs are for', () => {
    for (const id of [
      'hg38-ncbiRefSeq',
      'hg38-ncbiRefSeqCurated',
      'hg38-ncbiRefSeqSelect',
      'hg38-gencodeComp',
      'hg38-gencodeBasic',
      'hg38-rmsk',
      'hg38-rmskJoinedCurrent',
      'hg38-gap',
      'hg38-gapOverlap',
      'hg38-allGaps',
    ]) {
      assert.equal(shouldIncludeTrack(id), true, id)
    }
  })

  // The regression this predicate exists in its current form for: as a bare
  // substring match, `gencode` matched `wgencode`, so every ENCODE regulation
  // track landed in the minimal configs. On hg38 that was 11 of 33 tracks and
  // 82% of the bytes.
  it('does not mistake wgEncode for gencode', () => {
    for (const id of [
      'hg38-wgEncodeReg4Dnase',
      'hg38-wgEncodeRegTxn',
      'hg38-wgEncodeRegMarkH3k27ac',
      'hg38-wgEncodeReg4MarkCtcf',
      'hg38-wgEncodeRegDnaseWig',
    ]) {
      assert.equal(shouldIncludeTrack(id), false, id)
    }
  })

  it('does not match a pattern buried inside another word', () => {
    for (const id of [
      'hg38-vegaPseudoGene', // ...ve[gap]seudogene
      'hg19-cgapSage', // c[gap]sage
      'hg38-nmdEscGencode', // nmdesc[gencode]
      'hg38-nmdEscNcbiRefSeq',
    ]) {
      assert.equal(shouldIncludeTrack(id), false, id)
    }
  })

  it('matches an unprefixed trackId too', () => {
    assert.equal(shouldIncludeTrack('gencodeComp'), true)
    assert.equal(shouldIncludeTrack('wgEncodeRegTxn'), false)
  })
})
