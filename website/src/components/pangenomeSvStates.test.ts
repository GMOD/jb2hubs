import assert from 'node:assert'
import { test } from 'node:test'

import {
  packRecord,
  parseSvStateRow,
  stateKey,
  structuralForms,
} from './pangenomeSvStates.ts'

test('an allele near the reference length is the reference structure', () => {
  assert.equal(stateKey(0, false), '0')
  assert.equal(stateKey(-46, false), '0')
  assert.equal(stateKey(49, false), '0')
  // an inversion moves no length, so nothing else would record it
  assert.equal(stateKey(0, true), 'v')
})

test('a larger change keys on its size, within a tenth of itself', () => {
  assert.equal(stateKey(-1716, false), '-1700')
  assert.equal(stateKey(-1740, false), '-1700')
  assert.equal(stateKey(5600, false), '+5600')
  // two repeat units is a different state from one
  assert.notEqual(stateKey(11200, false), stateKey(5600, false))
})

test('a record packs to one character per haplotype, commonest state first', () => {
  const packed = packRecord({
    refLength: 1716,
    altLengths: [1, 1716, 5600],
    inverted: false,
    calls: ['0|1', '1|1', '0|0', '2|3', '.'],
  })
  // allele 1 deletes 1715 bp and three haplotypes carry it, allele 3 adds 3884
  // and one does; allele 2 changes no length, so it is the reference structure
  assert.equal(packed.states, '1:-1700,2:+3900')
  assert.equal(packed.genotypes, '01' + '11' + '00' + '02' + '..')
})

test('an inversion is its own state, however its alleles are called', () => {
  const packed = packRecord({
    refLength: 300,
    altLengths: [300],
    inverted: true,
    calls: ['0|1'],
  })
  assert.equal(packed.states, 'v:inv')
  assert.equal(packed.genotypes, '0v')
})

test('forms group the haplotypes that match at every informative site', () => {
  const haplotypes = ['A#1', 'A#2', 'B#1', 'B#2', 'C#1', 'C#2']
  const row = (genotypes: string) =>
    parseSvStateRow(`chr1\t100\t200\tid\t1:-1700\t${genotypes}`)
  const result = structuralForms(
    // first site splits 3 against 3, second is carried by one haplotype
    [row('111000'), row('100000')],
    haplotypes,
    3,
  )
  assert.equal(result.informative, 1)
  assert.deepEqual(
    result.forms.map(f => f.members),
    [
      ['A#1', 'A#2', 'B#1'],
      ['B#2', 'C#1', 'C#2'],
    ],
  )
  // the one carrying the rare state is still in the form it otherwise matches
  assert.deepEqual(result.rareCarriers, ['A#1'])
})

test('a window with nothing informative is one form', () => {
  const haplotypes = ['A#1', 'A#2']
  const result = structuralForms([], haplotypes)
  assert.equal(result.sites, 0)
  assert.deepEqual(result.forms, [{ key: '', members: haplotypes }])
})
