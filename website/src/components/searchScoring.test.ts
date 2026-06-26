import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { entryHref, scoreEntry, scoreTerm } from './searchScoring.ts'

import type { IndexEntry } from '../hooks/useSearchIndex.ts'

interface EntryOverrides {
  accession?: string
  commonName?: string
  scientificName?: string
  assemblyName?: string
  assemblyStatus?: string
  source?: string
  taxonId?: number
  ncbiStatus?: number
}

function entry(o: EntryOverrides = {}) {
  const e: IndexEntry = [
    o.accession ?? '',
    o.commonName ?? '',
    o.scientificName ?? '',
    o.assemblyName ?? '',
    o.assemblyStatus ?? '',
    o.source ?? 'genark',
    o.taxonId ?? 0,
    o.ncbiStatus ?? 0,
  ]
  return e
}

describe('scoreTerm', () => {
  it('ranks prefix > word-boundary > substring > miss', () => {
    assert.equal(scoreTerm('hum', 'human'), 3)
    assert.equal(scoreTerm('sap', 'homo sapiens'), 2)
    assert.equal(scoreTerm('apien', 'homo sapiens'), 1)
    assert.equal(scoreTerm('xyz', 'homo sapiens'), 0)
  })
})

describe('scoreEntry', () => {
  it('returns -1 when not every term matches somewhere', () => {
    const e = entry({ commonName: 'human', scientificName: 'homo sapiens' })
    assert.equal(scoreEntry(e, ['human', 'zebrafish']), -1)
  })

  it('ranks a tighter common-name match above a longer one', () => {
    const human = entry({
      accession: 'GCF_1',
      commonName: 'human',
      scientificName: 'homo sapiens',
    })
    const hpv = entry({
      accession: 'GCF_2',
      commonName: 'human papillomavirus type 85',
      scientificName: 'alphapapillomavirus',
    })
    assert.ok(scoreEntry(human, ['human']) > scoreEntry(hpv, ['human']))
  })

  it('weights common name above assembly name', () => {
    const inName = entry({ commonName: 'foo' })
    const inAssembly = entry({ assemblyName: 'foo' })
    assert.ok(scoreEntry(inName, ['foo']) > scoreEntry(inAssembly, ['foo']))
  })

  it('applies reference-genome and ucsc tiebreakers', () => {
    const plain = entry({ commonName: 'human' })
    const reference = entry({ commonName: 'human', ncbiStatus: 1 })
    const ucsc = entry({ commonName: 'human', source: 'ucsc' })
    assert.ok(scoreEntry(reference, ['human']) > scoreEntry(plain, ['human']))
    assert.ok(scoreEntry(ucsc, ['human']) > scoreEntry(plain, ['human']))
  })
})

describe('entryHref', () => {
  it('routes ucsc entries to /ucsc and others to /accession', () => {
    assert.equal(
      entryHref(entry({ accession: 'hg38', source: 'ucsc' })),
      '/ucsc/hg38',
    )
    assert.equal(
      entryHref(entry({ accession: 'GCF_1', source: 'genark' })),
      '/accession/GCF_1',
    )
  })
})
