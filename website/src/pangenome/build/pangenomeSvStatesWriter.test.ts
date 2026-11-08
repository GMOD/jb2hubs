import assert from 'node:assert'
import { test } from 'node:test'

import {
  RESTORED_STRUCTURAL_BP,
  ancestorChain,
  invertedAlleles,
  markPlaced,
  packRecord,
  packResidual,
  parseParent,
  stateKey,
} from './pangenomeSvStatesWriter.ts'

test('an allele near the reference length is the reference structure', () => {
  assert.equal(stateKey(0, false), '0')
  assert.equal(stateKey(-46, false), '0')
  assert.equal(stateKey(49, false), '0')
  // an inversion moves no length, so nothing else would record it
  assert.equal(stateKey(0, true), 'v')
})

test('a larger change keys on its size, to two significant figures', () => {
  assert.equal(stateKey(-1716, false), '-1700')
  assert.equal(stateKey(-1740, false), '-1700')
  assert.equal(stateKey(-84_684, false), '-85000')
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
  assert.equal(packed.genotypes, ['01', '11', '00', '02', '..'].join(''))
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

// cattle's callset: vg deconstruct writes one haploid column per assembly
test('a haploid callset packs one character per sample', () => {
  const packed = packRecord({
    refLength: 6618,
    altLengths: [1058, 6618],
    inverted: false,
    calls: ['1', '0', '.', '2'],
    ploidy: 1,
  })
  assert.equal(packed.states, '1:-5600')
  assert.equal(packed.genotypes, '10.0')
})

test('an ALT walking a node against the reference is an inversion', () => {
  assert.deepEqual(invertedAlleles('>1>2>4,>1<3>4,>1>4'), [true, false])
  assert.deepEqual(invertedAlleles('<9<7<5,<9>8<5'), [true])
  const packed = packRecord({
    refLength: 300,
    altLengths: [300, 1],
    inverted: invertedAlleles('>1>2>4,>1<2>4,>1>4'),
    calls: ['1', '2', '0'],
    ploidy: 1,
  })
  assert.equal(packed.states, '1:-300,v:inv')
  assert.equal(packed.genotypes, 'v10')
})

// Arabidopsis's merge2vcf walks: `*` is an empty allele, and an inversion
// steps through TAIR10's segments, or a new one, backwards
test('a minigraph walk against the reference is an inversion', () => {
  assert.deepEqual(invertedAlleles('>s23579,<s23579'), [true])
  assert.deepEqual(invertedAlleles('>s4789,<s188391'), [true])
  assert.deepEqual(invertedAlleles('*,>s143101>s143102>s143103'), [false])
})

test("a removed parent parses to each haplotype's size change", () => {
  const parent = parseParent(
    [
      'chr4\t68508114\t>1>9\t0\t.\t117314\t1,117200,120200',
      '0|1',
      '2|3',
      '.|1',
      '0',
    ].join('\t'),
    [0, 1, 2],
  )
  assert.deepEqual(parent, {
    chrom: 'chr4',
    start: 68_508_113,
    end: 68_625_427,
    id: '>1>9',
    parent: '.',
    deltas: [0, -117_313, -114, 2886, undefined, -117_313],
  })
})

test('a restored parent states what its children do not', () => {
  assert.equal(stateKey(-142, false, RESTORED_STRUCTURAL_BP), '0')
  assert.equal(stateKey(-117_313, false, RESTORED_STRUCTURAL_BP), '-120000')
  // the second haplotype's 1.7 kb deletion is a child's, and so is all but 114
  // bp of the fourth's insertion
  assert.deepEqual(
    packResidual(
      [0, -1716, -117_313, 2886, undefined, -117_313],
      [0, -1716, 0, 3000, 0, 0],
    ),
    { states: '1:-120000', genotypes: '0010.1' },
  )
})

test('a no call under a snarl that calls the haplotype is placed', () => {
  assert.equal(markPlaced('0.1..', []), '0.1..')
  assert.equal(
    markPlaced('0.1..', [
      [0, 0, 5, undefined, undefined],
      [undefined, undefined, undefined, undefined, 0],
    ]),
    '0_1._',
  )
})

test('the chain of removed ancestors is nearest first and ends at a gap', () => {
  const row = (id: string, parent: string) => ({
    chrom: 'chr1',
    start: 1,
    end: 2,
    id,
    parent,
    deltas: [0, 0],
  })
  const parents = new Map(
    [row('top', '.'), row('mid', 'top'), row('orphan', 'absent')].map(p => [
      p.id,
      p,
    ]),
  )
  assert.deepEqual(
    ancestorChain('mid', parents).map(p => p.id),
    ['mid', 'top'],
  )
  assert.deepEqual(
    ancestorChain('orphan', parents).map(p => p.id),
    ['orphan'],
  )
  assert.deepEqual(ancestorChain('.', parents), [])
})
