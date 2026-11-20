import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { trackNameFromLabels } from './trackName.ts'

describe('trackNameFromLabels', () => {
  it('joins a set and its member', () => {
    assert.equal(
      trackNameFromLabels(['NCBI RefSeq', 'RefSeq Curated']),
      'NCBI RefSeq - RefSeq Curated',
    )
  })

  it('says the set once when its member repeats it', () => {
    assert.equal(
      trackNameFromLabels(['ClinGen', 'ClinGen Haploinsufficiency']),
      'ClinGen - Haploinsufficiency',
    )
    assert.equal(trackNameFromLabels(['M-CAP', 'M-CAP: A']), 'M-CAP - A')
    assert.equal(
      trackNameFromLabels(['gnomAD v4.1.1', 'gnomAD v4.1.1 Exomes']),
      'gnomAD v4.1.1 - Exomes',
    )
  })

  it('names the members of one set alike, whether or not they repeat it', () => {
    assert.equal(
      trackNameFromLabels(['HapMap SNPs', 'HapMap SNPs ASW']),
      'HapMap SNPs - ASW',
    )
    assert.equal(
      trackNameFromLabels(['HapMap SNPs', 'Chimp Alleles']),
      'HapMap SNPs - Chimp Alleles',
    )
  })

  it('keeps a member whole when it only runs on from its set', () => {
    assert.equal(
      trackNameFromLabels(['dbVar Somatic SV', 'dbVar Somatic SVs']),
      'dbVar Somatic SV - dbVar Somatic SVs',
    )
    assert.equal(
      trackNameFromLabels(['N-SCAN', 'N-SCAN+EST']),
      'N-SCAN - N-SCAN+EST',
    )
  })

  it('keeps a member whole when what is left names nothing', () => {
    assert.equal(
      trackNameFromLabels(['Riken CAGE', 'Riken CAGE +']),
      'Riken CAGE - Riken CAGE +',
    )
    assert.equal(
      trackNameFromLabels(['Riken CAGE', 'Riken CAGE -']),
      'Riken CAGE - Riken CAGE -',
    )
  })

  it('keeps a member whole when another of its set has what is left', () => {
    assert.equal(
      trackNameFromLabels(
        ['UniProt', 'UniProt Structure'],
        label => label === 'Structure',
      ),
      'UniProt - UniProt Structure',
    )
  })

  it('compares each label with the one before it', () => {
    assert.equal(
      trackNameFromLabels(['Variation', 'gnomAD', 'gnomAD Exomes']),
      'Variation - gnomAD - Exomes',
    )
  })

  it('names a track with no set, or one labelled as its set is, once', () => {
    assert.equal(trackNameFromLabels([undefined, 'CpG Islands']), 'CpG Islands')
    assert.equal(trackNameFromLabels(['GERP', 'GERP']), 'GERP')
    assert.equal(trackNameFromLabels(['', 'GERP']), 'GERP')
  })
})
