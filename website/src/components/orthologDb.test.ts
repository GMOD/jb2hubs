import assert from 'node:assert'
import { test } from 'node:test'

import { createStore, speciesLabel } from './orthologDb.ts'

import type { AssemblyIndex } from './orthologDb.ts'

const index: AssemblyIndex = {
  'GCF_000001405.40': ['human', 'Homo sapiens', 9606, 'hg38'],
  'GCF_000001635.27': ['mouse', 'Mus musculus', 10090, 'mm39'],
  'GCF_000001635.9': ['mouse', 'Mus musculus', 10090, 'mm10'],
  'GCA_009914755.4': ['', 'Homo sapiens', 9606],
}

test('an exact accession resolves to its own entry', () => {
  const found = createStore(index).find('GCF_000001635.9')
  assert.equal(found?.ucscDb, 'mm10')
})

// NCBI's ortholog API routinely names a version of an assembly we do not host,
// and the whole point of the fallback is that the row still resolves.
test('an unhosted version falls back to the same base accession', () => {
  const found = createStore(index).find('GCF_000001405.99')
  assert.equal(found?.accession, 'GCF_000001405.40')
  assert.equal(found?.ucscDb, 'hg38')
})

// Two versions of one base are both hosted here (mm39 and mm10). Key order in a
// JSON object is insertion order, so "whichever came last" would make this
// depend on how the index happened to be written.
test('the fallback picks the newest hosted version, not the last key', () => {
  const found = createStore(index).find('GCF_000001635.1')
  assert.equal(found?.accession, 'GCF_000001635.27')
  assert.equal(found?.ucscDb, 'mm39')
})

test('an unknown accession is undefined rather than a half-built assembly', () => {
  assert.equal(createStore(index).find('GCF_999999999.1'), undefined)
})

test('the fourth slot is absent for GenArk-only assemblies', () => {
  assert.equal(createStore(index).find('GCA_009914755.4')?.ucscDb, undefined)
})

// 43,828 of the 44,685 index entries carry an assembly parenthetical on the
// common name, which is what makes the species column unreadable at several
// hundred rows.
test('speciesLabel drops a trailing assembly parenthetical', () => {
  assert.equal(
    speciesLabel('cattle (Hereford L1 Dominette 42190680 v1.3 2018 USDA)'),
    'cattle',
  )
  assert.equal(speciesLabel('Pyrobaculum sp. (DRTY-1 2024)'), 'Pyrobaculum sp.')
  assert.equal(speciesLabel('human'), 'human')
  assert.equal(speciesLabel(''), '')
})

// Only a parenthetical that ends the string goes, and only when a name is left
// — otherwise the cell would render blank for a species whose whole common name
// is parenthesised.
test('speciesLabel leaves an interior or whole-string parenthetical alone', () => {
  assert.equal(
    speciesLabel('frog (X. tropicalis) western clawed'),
    'frog (X. tropicalis) western clawed',
  )
  assert.equal(speciesLabel('(unnamed 2019)'), '(unnamed 2019)')
})
