import assert from 'node:assert'
import { test } from 'node:test'

import { createStore } from './orthologDb.ts'

import type { AssemblyIndex } from './orthologDb.ts'

const index: AssemblyIndex = {
  schema: 'ortholog-index/2',
  accessions: [
    'GCF_000001405.40',
    'GCF_000001635.27',
    'GCF_000001635.9',
    'GCA_009914755.4',
  ],
  ucscDb: {
    'GCF_000001405.40': 'hg38',
    'GCF_000001635.27': 'mm39',
    'GCF_000001635.9': 'mm10',
  },
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

// Two versions of one base are both hosted here (mm39 and mm10), so "whichever
// came last in the list" would make this depend on how the index happened to be
// written.
test('the fallback picks the newest hosted version, not the last entry', () => {
  const found = createStore(index).find('GCF_000001635.1')
  assert.equal(found?.accession, 'GCF_000001635.27')
  assert.equal(found?.ucscDb, 'mm39')
})

test('an unknown accession is undefined rather than a half-built assembly', () => {
  assert.equal(createStore(index).find('GCF_999999999.1'), undefined)
})

test('ucscDb is absent for GenArk-only assemblies', () => {
  assert.equal(createStore(index).find('GCA_009914755.4')?.ucscDb, undefined)
})
