import assert from 'node:assert'
import { test } from 'node:test'

import {
  changeKind,
  RESTORED_STRUCTURAL_BP,
  ancestorChain,
  invertedAlleles,
  markPlaced,
  mergeSplitEvents,
  minCarriersFor,
  packRecord,
  packResidual,
  pairShifts,
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

test('a form needs 1% of the haplotypes, and at least one', () => {
  assert.equal(minCarriersFor(462), 5)
  assert.equal(minCarriersFor(11), 1)
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

test('a form marks each site where it is not the reference, in order', () => {
  const haplotypes = ['A#1', 'A#2', 'B#1', 'B#2']
  const result = structuralForms(
    [
      parseSvStateRow('chr1\t100\t200\tdel\t1:-1700\t1100'),
      parseSvStateRow('chr1\t300\t301\tins\t1:+6400\t0011'),
      parseSvStateRow('chr1\t400\t900\tinv\tv:inv\t..vv'),
    ],
    haplotypes,
    2,
  )
  assert.deepEqual(
    result.forms.map(f => f.marks),
    [
      [
        { site: 1, start: 300, end: 301, kind: 'insertion', bp: 6400 },
        { site: 2, start: 400, end: 900, kind: 'inversion', bp: 0 },
      ],
      [
        { site: 0, start: 100, end: 200, kind: 'deletion', bp: 1700 },
        { site: 2, start: 400, end: 900, kind: 'uncalled', bp: 0 },
      ],
    ],
  )
  assert.deepEqual(
    result.informativeSites.map(s => s.aligned),
    [4, 4, 2],
  )
})

// GSTM1: 77 haplotypes carry an 18 kb deletion over the gene and an 18 kb
// insertion at its end, which is the reference's length.
test('a deletion and an insertion of one size pair into a shift', () => {
  const marks = pairShifts([
    { site: 0, start: 100, end: 18_200, kind: 'deletion', bp: 18_000 },
    { site: 1, start: 20_000, end: 20_001, kind: 'insertion', bp: 17_000 },
    { site: 2, start: 30_000, end: 30_001, kind: 'insertion', bp: 300 },
  ])
  assert.deepEqual(marks, [
    { site: 0, start: 100, end: 20_001, kind: 'shifted', bp: 18_000 },
    { site: 2, start: 30_000, end: 30_001, kind: 'insertion', bp: 300 },
  ])
  // a size apart by more than 10% is two changes
  assert.equal(
    pairShifts([
      { site: 0, start: 100, end: 18_200, kind: 'deletion', bp: 18_000 },
      { site: 1, start: 20_000, end: 20_001, kind: 'insertion', bp: 6400 },
    ]).length,
    2,
  )
})

// C4: vcfwave anchors the extra 26 kb module at a dozen bases of one snarl.
test('one size change split over records of one snarl is one record', () => {
  const merged = mergeSplitEvents([
    parseSvStateRow('chr6\t100\t101\t>1>9_1\t1:+26000\t10..0'),
    parseSvStateRow('chr6\t500\t501\t>1>9_2;chr6:501_0\t1:+26000\t01..0'),
    parseSvStateRow('chr6\t600\t601\t>1>9_3\t1:+33000\t00_.1'),
    parseSvStateRow('chr6\t700\t900\t>5>6\t1:-1700\t11000'),
  ])
  assert.deepEqual(merged, [
    {
      chrom: 'chr6',
      start: 100,
      end: 501,
      id: '>1>9',
      states: '1:26000',
      genotypes: '11_.0',
      kinds: new Map([['1', 'insertion']]),
    },
    {
      chrom: 'chr6',
      start: 600,
      end: 601,
      id: '>1>9',
      states: '1:33000',
      genotypes: '00_.1',
      kinds: new Map([['1', 'insertion']]),
    },
    {
      chrom: 'chr6',
      start: 700,
      end: 900,
      id: '>5>6',
      states: '1:-1700',
      genotypes: '11000',
    },
  ])
})

// Checked against the release's wave callset on 2026-10-21: GSTM1's deletion
// is REF 18,446 to 1, C4's 26 kb gain REF 32,738 to 59,108, and LPA's KIV-2
// gains replace a 30,736 bp array.
test('a state inserts, deletes, or replaces its site', () => {
  assert.equal(changeKind(1, 18_000), 'insertion')
  assert.equal(changeKind(18_446, -18_000), 'deletion')
  assert.equal(changeKind(32_738, 26_000), 'replacement')
  assert.equal(changeKind(30_736, 78_000), 'replacement')
  assert.equal(changeKind(176_380, -94_000), 'replacement')
  // 100 bp to 200 bp is a replacement, 5 bp to 300 bp an insertion
  assert.equal(changeKind(100, 100), 'replacement')
  assert.equal(changeKind(5, 300), 'insertion')
})

test("a restored parent's row says so, and its replacement is net", () => {
  const row = parseSvStateRow('chr6\t1000\t31000\t>1>2\t1:+78000\t11110\tr')
  assert.equal(row.restored, true)
  assert.equal(
    parseSvStateRow('chr6\t1000\t31000\t>1>2\t1:+78000\t11110').restored,
    undefined,
  )
  const result = structuralForms([row], ['A#1', 'A#2', 'B#1', 'B#2', 'C#1'], 1)
  assert.deepEqual(
    result.forms[0]!.marks.map(m => [m.kind, m.net]),
    [['replacement', true]],
  )
})

test('split records that each replace bases merge into a replacement', () => {
  const [merged] = mergeSplitEvents([
    parseSvStateRow('chr6\t100\t101\t>1>9_1\t1:+5000\t10..0'),
    parseSvStateRow('chr6\t500\t900\t>1>9_2\t1:+5000\t01..0'),
  ])
  assert.deepEqual(merged!.kinds, new Map([['1', 'replacement']]))
})

test('a gain at a site wider than the structural floor is a replacement', () => {
  const result = structuralForms(
    [
      parseSvStateRow(
        `chr6\t1000\t31000\tkiv\t1:+78000,2:-20000\t${'1'.repeat(6)}${'2'.repeat(6)}${'0'.repeat(8)}`,
      ),
    ],
    Array.from({ length: 20 }, (_, i) => `HG${i}#1`),
  )
  assert.deepEqual(
    result.forms.map(f => f.marks.map(m => [m.kind, m.bp, m.gain])),
    [[], [['replacement', 78_000, true]], [['replacement', 20_000, false]]],
  )
  assert.deepEqual(
    result.forms.map(f => f.deltas),
    [[], [78_000], [-20_000]],
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
      marks: [],
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

// CFHR: +330 bp at 196,792,226 on 112 haplotypes and at 196,770,973 on 2, in
// one bubble. One span over both drew the first as net over 21 kb.
test('one size change merges only across records near each other', () => {
  const merged = mergeSplitEvents([
    parseSvStateRow('chr1\t1000\t1001\t>1>9_1\t1:+330\t1000'),
    parseSvStateRow('chr1\t22000\t22001\t>1>9_2\t1:+330\t01~0'),
  ])
  assert.deepEqual(
    merged.map(r => [r.start, r.end, r.genotypes]),
    [
      [1000, 1001, '10~0'],
      [22000, 22001, '01~0'],
    ],
  )
})

test('a deletion pairs with no insertion far from it or net across a parent', () => {
  // 18 kb apart by 200 kb
  assert.deepEqual(
    pairShifts([
      { site: 0, start: 100, end: 18_200, kind: 'deletion', bp: 18_000 },
      { site: 1, start: 220_000, end: 220_001, kind: 'insertion', bp: 18_000 },
    ]).map(m => m.kind),
    ['deletion', 'insertion'],
  )
  // a residual 8 kb shorter somewhere in an 800 kb parent
  assert.deepEqual(
    pairShifts([
      {
        site: 0,
        start: 0,
        end: 800_000,
        kind: 'replacement',
        bp: 8000,
        gain: false,
      },
      { site: 1, start: 9000, end: 9001, kind: 'insertion', bp: 8000 },
    ]).map(m => m.kind),
    ['replacement', 'insertion'],
  )
})

// chr3:90,699,772 has 384 carriers, 74 no calls and 4 bypasses: the 4 fold
// into the carriers' form, and counted from the raw row the share read 101%.
test("a site's carriers never pass the haplotypes aligned there", () => {
  const haplotypes = Array.from({ length: 20 }, (_, i) => `HG${i}#1`)
  const result = structuralForms(
    [
      parseSvStateRow(
        `chr1\t100\t101\ta\t1:+110\t${'1'.repeat(10)}${'_'.repeat(3)}${'.'.repeat(7)}`,
      ),
      parseSvStateRow(`chr1\t200\t201\tb\t1:-2000\t${'0'.repeat(20)}`),
    ],
    haplotypes,
  )
  const carriers = result.forms
    .filter(f => f.marks.some(m => m.kind === 'insertion'))
    .reduce((n, f) => n + f.members.length, 0)
  assert.equal(carriers, 13)
  assert.equal(result.informativeSites[0]!.aligned, 13)
})
