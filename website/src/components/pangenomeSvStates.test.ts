import assert from 'node:assert'
import { test } from 'node:test'

import {
  RESTORED_STRUCTURAL_BP,
  ancestorChain,
  markPlaced,
  packRecord,
  packResidual,
  parseParent,
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
  // equal-sized forms tie-break on their states, so the reference-like one leads
  assert.deepEqual(
    result.forms.map(f => f.members),
    [
      ['B#2', 'C#1', 'C#2'],
      ['A#1', 'A#2', 'B#1'],
    ],
  )
  // the one carrying the rare state is still in the form it otherwise matches
  assert.deepEqual(result.rareCarriers, ['A#1'])
})

test('a form says what it changes against the reference, largest first', () => {
  const haplotypes = ['A#1', 'A#2', 'B#1', 'B#2', 'C#1', 'C#2']
  const row = (states: string, genotypes: string) =>
    parseSvStateRow(`chr1\t100\t200\tid\t${states}\t${genotypes}`)
  const result = structuralForms(
    [
      row('1:-1700', '110000'),
      row('1:+65000', '110011'),
      row('v:inv', '00vv..'),
    ],
    haplotypes,
    2,
  )
  assert.deepEqual(
    result.forms.map(f => [f.key, f.deltas, f.inversions, f.uncalled]),
    [
      ['00v', [], 1, 0],
      ['01.', [65_000], 0, 1],
      ['110', [65_000, -1700], 0, 0],
    ],
  )
})

test('a window with nothing informative is one form', () => {
  const haplotypes = ['A#1', 'A#2']
  const result = structuralForms([], haplotypes)
  assert.equal(result.sites, 0)
  assert.deepEqual(result.forms, [
    {
      key: '',
      members: haplotypes,
      deltas: [],
      inversions: 0,
      uncalled: 0,
      rarer: 0,
      bypassed: 0,
    },
  ])
  assert.deepEqual(result.unplaced, [])
  assert.equal(result.nonReferenceMajority, 0)
})

// Haplotypes that all carry a deletion the reference lacks agree with each
// other, not with the reference, and the result has to say which.
test('a site the haplotypes share against the reference is counted', () => {
  const haplotypes = ['A#1', 'A#2', 'B#1', 'B#2']
  const row = (genotypes: string) =>
    parseSvStateRow(`chr1\t100\t200\tid\t1:-1700\t${genotypes}`)
  const result = structuralForms(
    [row('1111'), row('....'), row('0000')],
    haplotypes,
    3,
  )
  assert.equal(result.informative, 0)
  assert.equal(result.nonReferenceMajority, 2)
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

// UGT2B17's shape: the deletion carriers bypass every nested site, and the
// restored parent's row is what gives them a size.
test('a placed no call is a state of its own with no size', () => {
  const haplotypes = ['A#1', 'A#2', 'B#1', 'B#2', 'C#1', 'C#2']
  const row = (states: string, genotypes: string) =>
    parseSvStateRow(`chr4\t100\t200\tid\t${states}\t${genotypes}`)
  const result = structuralForms(
    [
      row('1:-120000', '00011.'),
      row('1:+300', '010__.'),
      row('1:-80', '000__.'),
    ],
    haplotypes,
    1,
  )
  assert.deepEqual(
    result.forms.map(f => [f.key, f.deltas, f.uncalled, f.bypassed]),
    [
      ['000', [], 0, 0],
      ['1__', [-120_000], 0, 2],
      ['010', [300], 0, 0],
    ],
  )
  assert.deepEqual(result.unplaced, ['C#2'])
})

test('a rare call under a no-call majority stays apart from it', () => {
  const haplotypes = Array.from({ length: 12 }, (_, i) => `HG${i}#1`)
  const row = (genotypes: string) =>
    parseSvStateRow(`chr8\t100\t200\tid\t1:-310\t${genotypes}`)
  const result = structuralForms([row('.......00001')], haplotypes, 4)
  assert.deepEqual(
    result.forms.map(f => [f.key, f.members.length]),
    [
      ['0', 4],
      ['~', 1],
    ],
  )
  assert.equal(result.unplaced.length, 7)
  assert.equal(result.forms[1]!.rarer, 1)
  assert.deepEqual(result.rareCarriers, ['HG11#1'])
})

// AMY1's 12: missing at the parent and everything under it, called in the flank.
test('a haplotype with a call at one site is in a form, one with none is not', () => {
  const haplotypes = ['A#1', 'A#2', 'B#1', 'B#2']
  const row = (genotypes: string) =>
    parseSvStateRow(`chr1\t100\t200\tid\t1:-1700\t${genotypes}`)
  const result = structuralForms([row('01..'), row('000.')], haplotypes, 1)
  assert.equal(result.informative, 2)
  assert.deepEqual(
    result.forms.map(f => [f.key, f.members, f.uncalled]),
    [
      ['.0', ['B#1'], 1],
      ['00', ['A#1'], 0],
      ['10', ['A#2'], 0],
    ],
  )
  assert.deepEqual(result.unplaced, ['B#2'])
})
