import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  MAX_SUGGESTIONS,
  suggestEntries,
  suggestionMeta,
  suggestionTitle,
} from './searchSuggestions.ts'

import type { IndexEntry } from '../hooks/useSearchIndex.ts'

const hg19: IndexEntry = [
  'hg19',
  'Human',
  'Homo sapiens',
  'GRCh37',
  '',
  'ucsc',
  9606,
  0,
  2009,
  3,
  'GCA_000001405.1',
]

const hg38: IndexEntry = [
  'hg38',
  'Human',
  'Homo sapiens',
  'GRCh38',
  '',
  'ucsc',
  9606,
  1,
  2013,
  1,
  'GCA_000001405.15',
]

const genarkHuman: IndexEntry = [
  'GCF_000001405.40',
  'human (GRCh38.p14 2022)',
  'Homo sapiens',
  'GRCh38.p14',
  'Chromosome',
  'primates',
  9606,
  1,
  2022,
  0,
  '',
]

const index = [hg19, hg38, genarkHuman]

describe('suggestEntries', () => {
  it('puts an exact db-name match first', () => {
    assert.equal(suggestEntries(index, 'hg19')[0], hg19)
  })

  it('ignores case and surrounding whitespace', () => {
    assert.equal(suggestEntries(index, '  HG19 ')[0], hg19)
  })

  it('returns nothing below the minimum query length', () => {
    assert.deepEqual(suggestEntries(index, 'h'), [])
    assert.deepEqual(suggestEntries(index, ' '), [])
  })

  it('matches on species name across sources', () => {
    const found = suggestEntries(index, 'homo sapiens')
    assert.equal(found.length, 3)
  })

  it('caps the list', () => {
    const many: IndexEntry[] = []
    for (let i = 0; i < 40; i++) {
      many.push([
        `db${i}`,
        'Human',
        'Homo sapiens',
        'x',
        '',
        'ucsc',
        9606,
        0,
        2009,
        0,
        '',
      ])
    }
    assert.equal(suggestEntries(many, 'human').length, MAX_SUGGESTIONS)
    assert.equal(suggestEntries(many, 'human', 3).length, 3)
  })

  it('drops non-matching rows rather than ranking them low', () => {
    assert.deepEqual(suggestEntries(index, 'mouse'), [])
  })
})

describe('suggestion labels', () => {
  it('leads with the assembly, which is what differs between rows', () => {
    assert.equal(suggestionTitle(hg19), 'hg19 · GRCh37')
    assert.equal(suggestionTitle(hg38), 'hg38 · GRCh38')
    assert.equal(
      suggestionTitle(genarkHuman),
      'GCF_000001405.40 · GRCh38.p14',
    )
  })

  it('does not repeat the accession when it is also the assembly name', () => {
    const sameName: IndexEntry = [...hg19]
    sameName[3] = 'hg19'
    assert.equal(suggestionTitle(sameName), 'hg19')
  })

  it('names the species underneath, with the common name in parens', () => {
    assert.equal(suggestionMeta(hg19), 'Homo sapiens (Human)')
  })

  it('strips the assembly parenthetical from a GenArk common name', () => {
    assert.equal(suggestionMeta(genarkHuman), 'Homo sapiens (human)')
  })

  it('falls back to whichever name exists', () => {
    const onlyCommon: IndexEntry = [...hg19]
    onlyCommon[2] = ''
    assert.equal(suggestionMeta(onlyCommon), 'Human')
    const onlyScientific: IndexEntry = [...hg19]
    onlyScientific[1] = ''
    assert.equal(suggestionMeta(onlyScientific), 'Homo sapiens')
  })
})
