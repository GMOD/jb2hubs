import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'

import { PANGENOME_DATASETS } from './pangenomeDataset.ts'
import { gains, sizeOf, sizedChange } from './pangenomeMarks.ts'
import {
  changeKind,
  formatSvStateRow,
  mergeSplitEvents,
  minCarriersFor,
  pairShifts,
  parseSvStateRow,
  structuralForms,
  HPRC_MIN_CARRIERS,
} from './pangenomeSvStates.ts'

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

test('a rare no call is not a rare change', () => {
  const haplotypes = ['A#1', 'A#2', 'B#1', 'B#2', 'C#1', 'C#2']
  const row = (genotypes: string) =>
    parseSvStateRow(`chr1\t100\t200\tid\t1:-1700\t${genotypes}`)
  const result = structuralForms(
    [row('111000'), row('00000.'), row('_00000')],
    haplotypes,
    3,
  )
  assert.deepEqual(result.rareCarriers, [])
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
        sizedChange('insertion', { site: 1, start: 300, end: 301 }, 6400),
        sizedChange('inversion', { site: 2, start: 400, end: 900 }, 0),
      ],
      [
        sizedChange('deletion', { site: 0, start: 100, end: 200 }, -1700),
        { site: 2, start: 400, end: 900, kind: 'uncalled' },
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
    sizedChange('deletion', { site: 0, start: 100, end: 18_200 }, -18_000),
    sizedChange('insertion', { site: 1, start: 20_000, end: 20_001 }, 17_000),
    sizedChange('insertion', { site: 2, start: 30_000, end: 30_001 }, 300),
  ])
  assert.deepEqual(marks, [
    {
      ...sizedChange('shift', { site: 0, start: 100, end: 20_001 }, 0),
      shiftedBp: 18_000,
    },
    sizedChange('insertion', { site: 2, start: 30_000, end: 30_001 }, 300),
  ])
  // a size apart by more than 10% is two changes
  assert.equal(
    pairShifts([
      sizedChange('deletion', { site: 0, start: 100, end: 18_200 }, -18_000),
      sizedChange('insertion', { site: 1, start: 20_000, end: 20_001 }, 6400),
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
    result.forms[0]!.marks.map(m => [m.kind, gains(m)]),
    [['net', true]],
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
    HPRC_MIN_CARRIERS,
  )
  assert.deepEqual(
    result.forms.map(f => f.marks.map(m => [m.kind, sizeOf(m), gains(m)])),
    [[], [['replacement', 78_000, true]], [['replacement', 20_000, false]]],
  )
  assert.deepEqual(
    result.forms.map(f => f.deltas),
    [[], [78_000], [-20_000]],
  )
})

test('a window with nothing informative is one form', () => {
  const haplotypes = ['A#1', 'A#2']
  const result = structuralForms([], haplotypes, HPRC_MIN_CARRIERS)
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

test('a rare bypass under a no-call majority is not a rare change', () => {
  const haplotypes = Array.from({ length: 12 }, (_, i) => `HG${i}#1`)
  const row = (genotypes: string) =>
    parseSvStateRow(`chr8\t100\t200\tid\t1:-310\t${genotypes}`)
  const result = structuralForms([row('.......0000_')], haplotypes, 4)
  assert.deepEqual(
    result.forms.map(f => [f.key, f.members, f.rarer]),
    [
      ['0', ['HG7#1', 'HG8#1', 'HG9#1', 'HG10#1'], 0],
      ['.', ['HG11#1'], 0],
    ],
  )
  assert.deepEqual(result.rareCarriers, [])
  assert.equal(result.informativeSites[0]!.aligned, 4)
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
      sizedChange('deletion', { site: 0, start: 100, end: 18_200 }, -18_000),
      sizedChange(
        'insertion',
        { site: 1, start: 220_000, end: 220_001 },
        18_000,
      ),
    ]).map(m => m.kind),
    ['deletion', 'insertion'],
  )
  // a residual 8 kb shorter somewhere in an 800 kb parent
  assert.deepEqual(
    pairShifts([
      sizedChange('replacement', { site: 0, start: 0, end: 800_000 }, -8000),
      sizedChange('insertion', { site: 1, start: 9000, end: 9001 }, 8000),
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
    HPRC_MIN_CARRIERS,
  )
  const carriers = result.forms
    .filter(f => f.marks.some(m => m.kind === 'insertion'))
    .reduce((n, f) => n + f.members.length, 0)
  assert.equal(carriers, 13)
  assert.equal(result.informativeSites[0]!.aligned, 13)
})

test('a row reads back as written', () => {
  for (const line of [
    'chr6\t1000\t31000\t>1>2\t1:+78000\t11110\tr',
    'chr1\t100\t200\tdel\t1:-1700\t1100\t.',
  ]) {
    assert.equal(formatSvStateRow(parseSvStateRow(line)), line)
  }
})

// CLAUDE.md: bump FORMAT and the url together, in every sidecar
test('each sidecar build writes the format its dataset reads', () => {
  const dir = new URL('../../pangenome-config/', import.meta.url)
  const builds = readdirSync(dir).filter(f => /^build\w+\.sh$/.test(f))
  const checked = builds.flatMap(file => {
    const script = readFileSync(new URL(file, dir), 'utf8')
    const format = /^FORMAT=(\S+)$/m.exec(script)?.[1]
    const dest = /^DEST=\S+\/pangenome\/([^/\s]+)\/([^/\s]+)$/m.exec(script)
    const dataset = PANGENOME_DATASETS.find(
      d => d.graphBrowser.bucketDir === dest?.[1],
    )
    const url = [dataset?.svStatesUrl, dataset?.graphVcf?.url].find(u =>
      u?.includes(`/${dest?.[1]}/${dest?.[2]}/`),
    )
    return format && dest ? [{ file, format, url }] : []
  })
  assert.ok(checked.length >= 5, checked.map(c => c.file).join(', '))
  for (const { file, format, url } of checked) {
    assert.ok(url?.includes(`.${format}.`), `${file}: FORMAT=${format}, ${url}`)
  }
})
