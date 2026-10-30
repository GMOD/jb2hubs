import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { HPRC_GRAPH_BROWSER } from './pangenomeDataset.ts'
import {
  COMPLETE_PANEL_SIZE,
  PANEL_SIZE,
  allotLanes,
  annotatedHaplotypes,
  changeName,
  changeWindow,
  describeForm,
  formLabel,
  headline,
  structuralPanel,
} from './pangenomePanels.ts'
import {
  diffuse,
  minCarriersFor,
  parseSvStateRow,
  structuralForms,
} from './pangenomeSvStates.ts'

import type { LaneConfig } from './pangenomePanels.ts'
import type { SiteMark } from './pangenomeSvStates.ts'

// n haplotypes, one form each, over enough sites to tell them apart
function forms(n: number, share = 5) {
  const haplotypes = Array.from({ length: n * share }, (_, i) => `HG${i}#1`)
  const sites = Array.from({ length: n }, (_, site) =>
    parseSvStateRow(
      `chr1\t100\t200\tsite${site}\t1:-1700\t${haplotypes
        .map((_, i) => (Math.floor(i / share) === site ? '1' : '0'))
        .join('')}`,
    ),
  )
  return structuralForms(sites, haplotypes)
}

test('a window with few forms draws every one, a busier one the largest', () => {
  assert.equal(
    structuralPanel(forms(COMPLETE_PANEL_SIZE))!.lanes.length,
    COMPLETE_PANEL_SIZE,
  )
  assert.equal(
    structuralPanel(forms(COMPLETE_PANEL_SIZE + 1))!.lanes.length,
    PANEL_SIZE,
  )
})

test('a lane says how many haplotypes it stands for, largest first', () => {
  const haplotypes = [
    'A#1',
    'A#2',
    'B#1',
    'B#2',
    'C#1',
    'C#2',
    'D#1',
    'D#2',
    'E#1',
    'E#2',
  ]
  const panel = structuralPanel(
    structuralForms(
      [parseSvStateRow(`chr1\t100\t200\tid\t1:-1700\t1111100000`)],
      haplotypes,
    ),
  )!
  // five carry the deletion and five do not; the reference-like form leads an
  // equal-sized pair
  assert.deepEqual(panel.lanes, [
    {
      haplotype: 'C#2',
      shares: 5,
      structure: 'ref',
      label: '',
      marks: [],
    },
    {
      haplotype: 'A#1',
      shares: 5,
      structure: 'del 1.7kb',
      label: 'del 1.7kb',
      marks: [{ site: 0, start: 100, end: 200, kind: 'deletion', bp: 1700 }],
    },
  ])
  assert.equal(panel.forms, 2)
  assert.equal(panel.placed, 10)
  assert.deepEqual(panel.changes, [
    {
      mark: { site: 0, start: 100, end: 200, kind: 'deletion', bp: 1700 },
      members: ['A#1', 'A#2', 'B#1', 'B#2', 'C#1'],
      carriers: 5,
      similarCarriers: 5,
    },
  ])
  assert.deepEqual(panel.alleleNames, {})
})

test('a change that is a known allele takes its name', () => {
  const haplotypes = ['A#1', 'A#2', 'B#1', 'B#2']
  const panel = structuralPanel(
    structuralForms(
      [parseSvStateRow(`chr1\t100\t200\tid\t1:-1700\t1100`)],
      haplotypes,
      1,
    ),
    {
      alleles: [
        {
          id: 'x',
          name: 'X duplication',
          chrom: 'chr1',
          start: 120,
          end: 180,
          about: '',
          inPanel: '',
          drawn: [{ gain: false, bp: 1716, label: 'no X' }],
          citations: [],
        },
      ],
    },
  )!
  assert.deepEqual(
    panel.lanes.map(l => l.label),
    ['', 'no X'],
  )
  assert.match(headline(panel, 'GRCh38'), /no X, in 50%/)
})

test('a gain and a loss of one size at one site are two changes', () => {
  const panel = structuralPanel(
    structuralForms(
      [parseSvStateRow(`chr1\t100\t9100\tid\t1:+5600,2:-5600\t112200`)],
      ['A#1', 'A#2', 'B#1', 'B#2', 'C#1', 'C#2'],
      1,
    ),
    {
      alleles: [
        {
          id: 'x',
          name: 'X',
          chrom: 'chr1',
          start: 100,
          end: 9100,
          about: '',
          inPanel: '',
          drawn: [{ gain: true, bp: 5600, label: 'X gain' }],
          citations: [],
        },
      ],
    },
  )!
  assert.deepEqual(
    panel.changes.map(c => [c.mark.gain, c.members, c.similarCarriers]),
    [
      [true, ['A#1', 'A#2'], 2],
      [false, ['B#1', 'B#2'], 2],
    ],
  )
  assert.deepEqual(Object.values(panel.alleleNames), ['X gain'])
  assert.equal(panel.lanes.filter(l => l.label === 'X gain').length, 1)
})

const mark = (
  kind: SiteMark['kind'],
  bp = 0,
  start = 100,
  end = start + Math.max(bp, 1),
): SiteMark => ({ site: 0, start, end, kind, bp })

// a site's bases replaced by sequence `bp` shorter
const shorter = (bp: number, start: number, end: number): SiteMark => ({
  ...mark('replacement', bp, start, end),
  gain: false,
})

test('a form is described by its largest changes against the reference', () => {
  assert.equal(describeForm({ marks: [] }), 'ref')
  assert.equal(
    describeForm({
      marks: [
        mark('deletion', 85_000),
        mark('insertion', 300, 100, 101),
        mark('inversion'),
        mark('uncalled'),
        mark('uncalled'),
      ],
    }),
    'del 85kb, ins 300bp +3',
  )
  assert.equal(
    describeForm({
      marks: [
        mark('deletion', 6100),
        mark('insertion', 5000, 100, 101),
        mark('deletion', 2700),
      ],
    }),
    'del 6.1kb, ins 5kb +1',
  )
  assert.equal(
    describeForm({ marks: [mark('inversion'), mark('uncalled')] }),
    'inv 1bp, no call',
  )
  assert.equal(
    describeForm({ marks: [mark('deletion', 3600), mark('rarer')] }),
    'del 3.6kb, rarer',
  )
})

test('a size change across a much wider site says it is net, not where', () => {
  // SMN's restored 1.6 Mb parent: routes 240 kb shorter, somewhere in it
  const parent = shorter(240_000, 69_713_780, 71_281_479)
  assert.ok(diffuse(parent))
  assert.equal(changeName(parent), 'net -240kb')
  // RHD's site is 97 kb, and its forms keep 27 kb of it
  const rhd = shorter(70_000, 0, 97_000)
  assert.ok(!diffuse(rhd))
  assert.equal(changeName(rhd), 'repl 97kb->27kb')
  assert.equal(
    changeName({ ...mark('replacement', 78_000, 0, 30_736), gain: true }),
    'repl 30.7kb->109kb',
  )
  assert.ok(!diffuse(mark('insertion', 26_000, 100, 101)))
  assert.ok(!diffuse(mark('deletion', 18_000)))
})

test("a lane's name is its largest change, and a count of the rest", () => {
  assert.equal(formLabel([]), '')
  assert.equal(formLabel([mark('bypassed'), mark('bypassed')]), 'other route')
  assert.equal(
    formLabel([mark('insertion', 300, 100, 101), mark('deletion', 18_000)]),
    'del 18kb +1',
  )
  assert.equal(formLabel([mark('shifted', 18_000)]), 'shift 18kb')
  assert.equal(formLabel([mark('uncalled')]), 'no call')
})

test('the headline names the largest common change and the reference share', () => {
  const haplotypes = Array.from({ length: 20 }, (_, i) => `HG${i}#1`)
  const panel = structuralPanel(
    structuralForms(
      [
        parseSvStateRow(
          `chr1\t100\t18200\tid\t1:-18000\t${'1'.repeat(14)}${'0'.repeat(6)}`,
        ),
      ],
      haplotypes,
    ),
  )!
  assert.equal(
    headline(panel, 'GRCh38'),
    "Largest common change: del 18kb, in 70% of haplotypes aligned there. GRCh38's structure: 30%.",
  )
})

// AMY1: a 79 bp deletion everyone carries said nothing beside the 94 kb one.
test('the headline leads with the largest change enough haplotypes carry', () => {
  const haplotypes = Array.from({ length: 40 }, (_, i) => `HG${i}#1`)
  const panel = structuralPanel(
    structuralForms(
      [
        parseSvStateRow(`chr1\t100\t180\tsmall\t1:-79\t${'1'.repeat(40)}`),
        parseSvStateRow(
          `chr1\t1000\t95000\tlarge\t1:-94000\t${'1'.repeat(6)}${'0'.repeat(34)}`,
        ),
        parseSvStateRow(
          `chr1\t200000\t400000\trare\t1:-190000\t1${'0'.repeat(39)}`,
        ),
      ],
      haplotypes,
    ),
  )!
  assert.match(
    headline(panel, 'GRCh38'),
    /^Largest common change: del 94kb, in 15% of haplotypes aligned there\./,
  )
})

// GSTT1: the gene's insertion is 54 kb on most carriers and 55 kb on a few.
test('the headline counts a change sized twice once, by its commonest size', () => {
  const haplotypes = Array.from({ length: 40 }, (_, i) => `HG${i}#1`)
  const panel = structuralPanel(
    structuralForms(
      [
        parseSvStateRow(
          `chr1\t1000\t1001\tins\t1:+54000,2:+55000\t${'1'.repeat(16)}${'2'.repeat(2)}${'0'.repeat(22)}`,
        ),
      ],
      haplotypes,
      2,
    ),
  )!
  assert.match(
    headline(panel, 'GRCh38'),
    /^Largest common change: ins 54kb, in 45% of haplotypes aligned there\./,
  )
})

test('the form the graph places at no site gets no lane', () => {
  const haplotypes = Array.from({ length: 20 }, (_, i) => `HG${i}#1`)
  const row = (genotypes: string) =>
    parseSvStateRow(`chrX\t100\t200\tsite\t1:-1700\t${genotypes}`)
  const panel = structuralPanel(
    structuralForms(
      [
        row('0'.repeat(7) + '1'.repeat(7) + '.'.repeat(6)),
        row('1'.repeat(7) + '0'.repeat(7) + '.'.repeat(6)),
      ],
      haplotypes,
    ),
  )!
  assert.deepEqual(
    panel.lanes.map(l => l.shares),
    [7, 7],
  )
  assert.equal(panel.forms, 2)
  assert.equal(panel.unplaced, 6)
})

test('a deletion spanning nested sites keeps its lane and says its size', () => {
  const haplotypes = Array.from({ length: 20 }, (_, i) => `HG${i}#1`)
  const row = (states: string, genotypes: string) =>
    parseSvStateRow(`chr4\t100\t200\tsite\t${states}\t${genotypes}`)
  const forms = structuralForms(
    [
      row('1:-120000', '0'.repeat(11) + '1'.repeat(9)),
      row('1:+300', '0'.repeat(11) + '_'.repeat(9)),
      row('1:-80', '0'.repeat(11) + '_'.repeat(9)),
    ],
    haplotypes,
  )
  const panel = structuralPanel(forms, { windowBp: 60_000 })!
  assert.deepEqual(
    panel.lanes.map(l => [l.shares, l.structure]),
    [
      [11, 'ref'],
      [9, 'del 120kb'],
    ],
  )
  assert.equal(panel.unplaced, 0)
  const deleted = new Set(haplotypes.slice(11))
  assert.ok(panel.lanesMayDrawEmpty.length > 0)
  assert.deepEqual(
    panel.lanesMayDrawEmpty,
    panel.laneHaplotypes.filter(h => deleted.has(h)),
  )
  // a window longer than the deletion keeps a flank, so the lane has to draw
  assert.deepEqual(
    structuralPanel(forms, { windowBp: 150_000 })!.lanesMayDrawEmpty,
    [],
  )
})

test('a window where nothing tells the haplotypes apart is no panel', () => {
  const haplotypes = ['A#1', 'A#2', 'B#1']
  assert.equal(structuralPanel(structuralForms([], haplotypes)), undefined)
  // one haplotype differing is a rare form, not a way to split the panel
  assert.equal(
    structuralPanel(
      structuralForms(
        [parseSvStateRow(`chr1\t1\t2\tid\t1:-1700\t100`)],
        haplotypes,
      ),
    ),
    undefined,
  )
})

const config = JSON.parse(
  readFileSync(
    new URL('../../pangenome-config/hprc-grch38.json', import.meta.url),
    'utf8',
  ),
) as LaneConfig
const trackId = HPRC_GRAPH_BROWSER.haplotypeLanesTrackId!

// generatePangenomeHaplotypes.ts gives every release 2 haplotype an assembly
// the lane track maps and a gene track: CAT's, or for HG002's two JHU's
// Liftoff. A haplotype missing from either reads "no annotation" on its lane,
// which is what skipping that script or buildHprcGenes.sh looks like.
test('the lane track maps every haplotype, and every one has gene models', () => {
  const lanes = config.tracks.find(t => t.trackId === trackId)!
  const mapped = Object.values(lanes.adapter.assemblyNameToPanSN!).filter(
    (h): h is string => h !== undefined && h !== 'GRCh38#0',
  )
  assert.ok(mapped.length >= 464, `${mapped.length} haplotypes mapped`)
  const annotated = annotatedHaplotypes(config, trackId)
  assert.deepEqual(
    mapped.filter(h => !annotated.has(h)),
    [],
  )
})

// AMY1: forms of 171 and 26 haplotypes only bypass sites, and neither is
// GRCh38's structure.
test("a form that only bypasses sites is another route, not the reference's", () => {
  assert.equal(describeForm({ marks: [mark('bypassed')] }), 'other route')
  const haplotypes = Array.from({ length: 20 }, (_, i) => `HG${i}#1`)
  const panel = structuralPanel(
    structuralForms(
      [
        parseSvStateRow(
          `chr1\t100\t4100\tp\t1:-4000\t${'1'.repeat(5)}${'0'.repeat(8)}${'_'.repeat(7)}`,
        ),
      ],
      haplotypes,
    ),
  )!
  assert.deepEqual(
    panel.lanes.map(l => [l.label, l.shares]),
    [
      ['', 8],
      ['other route', 7],
      ['del 4kb', 5],
    ],
  )
  assert.equal(panel.reference, 8)
  assert.match(headline(panel, 'GRCh38'), /GRCh38's structure: 40%/)
})

// SMN: the commonest form, 97 of 366, differs only by a rarer change.
test('a form told apart only by a rarer change has no lane', () => {
  const haplotypes = Array.from({ length: 20 }, (_, i) => `HG${i}#1`)
  const panel = structuralPanel(
    structuralForms(
      [
        parseSvStateRow(
          `chr1\t100\t4100\ta\t1:-4000,2:+3000,3:-2000\t${'.'.repeat(7)}${'1'.repeat(6)}${'2'.repeat(4)}${'3'.repeat(3)}`,
        ),
      ],
      haplotypes,
    ),
  )!
  assert.deepEqual(
    panel.lanes.map(l => l.label),
    ['del 4kb'],
  )
})

test("a form's graph is cut around its largest placed change", () => {
  // C4's HERV: 6.4 kb and 2 kb either side
  assert.deepEqual(
    changeWindow([mark('deletion', 6400, 32_017_420, 32_023_788)], 'chr6'),
    {
      mark: mark('deletion', 6400, 32_017_420, 32_023_788),
      region: { chrom: 'chr6', start: 32_015_420, end: 32_025_788 },
    },
  )
  // a net change has no place, and CFH's 85 kb is past what reads
  assert.equal(
    changeWindow([shorter(240_000, 69_713_780, 71_281_479)], 'chr5'),
    undefined,
  )
  assert.deepEqual(changeWindow([mark('deletion', 85_000)], 'chr1'), {
    mark: mark('deletion', 85_000),
  })
  assert.equal(changeWindow([mark('bypassed')], 'chr1'), undefined)
})

const members = (n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => `${tag}${String(i).padStart(3, '0')}#1`)

test('the haplotypes launch shares its lanes over the forms by carriers, one each at least', () => {
  const lanes = allotLanes(
    [
      { members: members(60, 'A') },
      { members: members(30, 'B') },
      { members: members(10, 'C') },
    ],
    10,
    new Set(),
  )
  assert.deepEqual(
    ['A', 'B', 'C'].map(t => lanes.filter(h => h.startsWith(t)).length),
    [5, 3, 2],
  )
})

test('with more forms than lanes, the largest forms get one each', () => {
  const forms = Array.from({ length: 12 }, (_, i) => ({
    members: members(20 - i, `F${i}x`),
  }))
  const lanes = allotLanes(forms, 10, new Set())
  assert.equal(lanes.length, 10)
  assert.deepEqual(
    lanes.map(h => h.split('x')[0]),
    forms.slice(0, 10).map((_, i) => `F${i}`),
  )
})

test('a form gets no more lanes than it has haplotypes', () => {
  const lanes = allotLanes(
    [{ members: members(2, 'A') }, { members: members(2, 'B') }],
    10,
    new Set(),
  )
  assert.equal(lanes.length, 4)
})

test("a form's lanes take the haplotypes with gene models first", () => {
  assert.deepEqual(
    allotLanes([{ members: ['HG002#1', 'HG003#1'] }], 1, new Set(['HG002#1'])),
    ['HG003#1'],
  )
})

// Cattle's 11 assemblies: a yak-only deletion is a form of its own, which
// HPRC's floor of 5 carriers would fold into the majority.
test('a panel of 11 haplotypes draws a form one of them carries', () => {
  const haplotypes = 'ANG BIS BRA BSW GAU HIG NEL OBV PIE SIM YAK'.split(' ')
  const sites = [
    parseSvStateRow('chr6\t100\t2100\t>1>3\t1:-2000\t00000000001'),
    parseSvStateRow('chr6\t5000\t5001\t>3>5\t1:+3000\t01001000001'),
  ]
  const panel = structuralPanel(
    structuralForms(sites, haplotypes, minCarriersFor(haplotypes.length)),
  )!
  assert.deepEqual(
    panel.lanes.map(l => [l.haplotype, l.shares, l.label]),
    [
      ['ANG', 8, ''],
      ['BIS', 2, 'ins 3kb'],
      ['YAK', 1, 'ins 3kb +1'],
    ],
  )
  assert.equal(structuralPanel(structuralForms(sites, haplotypes)), undefined)
})
