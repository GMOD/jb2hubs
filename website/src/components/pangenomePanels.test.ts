import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { HPRC_GRAPH_BROWSER } from './pangenomeDataset.ts'
import {
  COMPLETE_PANEL_SIZE,
  PANEL_SIZE,
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
      structure: 'as the reference',
      label: '',
      mayDrawEmpty: false,
      marks: [],
    },
    {
      haplotype: 'A#1',
      shares: 5,
      structure: '1.7 kb deletion',
      label: '1.7 kb deletion',
      mayDrawEmpty: false,
      marks: [{ site: 0, start: 100, end: 200, kind: 'deletion', bp: 1700 }],
    },
  ])
  assert.equal(panel.forms, 2)
  assert.equal(panel.placed, 10)
  assert.deepEqual(panel.changes, [
    {
      mark: { site: 0, start: 100, end: 200, kind: 'deletion', bp: 1700 },
      carriers: 5,
    },
  ])
})

const mark = (
  kind: SiteMark['kind'],
  bp = 0,
  start = 100,
  end = start + Math.max(bp, 1),
): SiteMark => ({ site: 0, start, end, kind, bp })

test('a form is described by its largest changes against the reference', () => {
  assert.equal(describeForm({ marks: [] }), 'as the reference')
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
    '85 kb deletion, 300 bp insertion, inversion, not aligned at 2 sites',
  )
  assert.equal(
    describeForm({
      marks: [
        mark('deletion', 6100),
        mark('insertion', 5000, 100, 101),
        mark('deletion', 2700),
      ],
    }),
    '3 size changes, largest a 6.1 kb deletion',
  )
  assert.equal(
    describeForm({ marks: [mark('inversion'), mark('uncalled')] }),
    'inversion, not aligned at 1 site',
  )
  assert.equal(
    describeForm({ marks: [mark('deletion', 3600), mark('rarer')] }),
    '3.6 kb deletion, a rarer change at 1 site',
  )
})

test('a size change across a much wider site says it is net, not where', () => {
  // SMN's restored 1.6 Mb parent: routes 240 kb shorter, somewhere in it
  const parent = mark('deletion', 240_000, 69_713_780, 71_281_479)
  assert.ok(diffuse(parent))
  assert.equal(changeName(parent), '240 kb shorter in 1.6 Mb')
  // RHD's 70 kb deletion fills most of its 97 kb site
  assert.ok(!diffuse(mark('deletion', 70_000, 0, 97_000)))
  assert.ok(!diffuse(mark('insertion', 26_000, 100, 101)))
})

test("a lane's name is its largest change, and a count of the rest", () => {
  assert.equal(formLabel([]), '')
  assert.equal(
    formLabel([mark('bypassed'), mark('bypassed')]),
    'another route at 2 sites',
  )
  assert.equal(
    formLabel([mark('insertion', 300, 100, 101), mark('deletion', 18_000)]),
    '18 kb deletion, 1 more',
  )
  assert.equal(
    formLabel([mark('shifted', 18_000)]),
    '18 kb shifted, same length',
  )
  assert.equal(formLabel([mark('uncalled')]), 'not aligned')
})

test('the headline names the commonest change and the reference share', () => {
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
    "Commonest change: 18 kb deletion, in 70% of haplotypes aligned there. GRCh38's structure: 30%.",
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
    panel.lanes.map(l => [l.shares, l.structure, l.mayDrawEmpty]),
    [
      [11, 'as the reference', false],
      [9, '120 kb deletion', true],
    ],
  )
  assert.equal(panel.unplaced, 0)
  // a window longer than the deletion keeps a flank, so the lane has to draw
  assert.deepEqual(
    structuralPanel(forms, { windowBp: 150_000 })!.lanes.map(
      l => l.mayDrawEmpty,
    ),
    [false, false],
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

// HPRC's CAT index annotates every release 2 haplotype but HG002's two, and
// generatePangenomeHaplotypes.ts gives each an assembly the lane track maps and
// a gene track. A haplotype missing from either reads "no annotation" on its
// lane, which is what skipping that script or buildHprcGenes.sh looks like.
const UNANNOTATED = ['HG002#1', 'HG002#2']

test('the lane track maps every haplotype, and all but HG002 have gene models', () => {
  const lanes = config.tracks.find(t => t.trackId === trackId)!
  const mapped = Object.values(lanes.adapter.assemblyNameToPanSN!).filter(
    (h): h is string => h !== undefined && h !== 'GRCh38#0',
  )
  assert.ok(mapped.length >= 464, `${mapped.length} haplotypes mapped`)
  const annotated = annotatedHaplotypes(config, trackId)
  assert.deepEqual(mapped.filter(h => !annotated.has(h)).sort(), UNANNOTATED)
})

// AMY1: forms of 171 and 26 haplotypes only bypass sites, and neither is
// GRCh38's structure.
test("a form that only bypasses sites is another route, not the reference's", () => {
  assert.equal(
    describeForm({ marks: [mark('bypassed')] }),
    'another route at 1 site',
  )
  const haplotypes = Array.from({ length: 20 }, (_, i) => `HG${i}#1`)
  const panel = structuralPanel(
    structuralForms(
      [
        parseSvStateRow(
          `chr1\t100\t5000\tp\t1:-4000\t${'1'.repeat(5)}${'0'.repeat(8)}${'_'.repeat(7)}`,
        ),
      ],
      haplotypes,
    ),
  )!
  assert.deepEqual(
    panel.lanes.map(l => [l.label, l.shares]),
    [
      ['', 8],
      ['another route at 1 site', 7],
      ['4 kb deletion', 5],
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
          `chr1\t100\t5000\ta\t1:-4000,2:+3000,3:-2000\t${'.'.repeat(7)}${'1'.repeat(6)}${'2'.repeat(4)}${'3'.repeat(3)}`,
        ),
      ],
      haplotypes,
    ),
  )!
  assert.deepEqual(
    panel.lanes.map(l => l.label),
    ['4 kb deletion'],
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
    changeWindow([mark('deletion', 240_000, 69_713_780, 71_281_479)], 'chr5'),
    undefined,
  )
  assert.equal(changeWindow([mark('deletion', 85_000)], 'chr1'), undefined)
  assert.equal(changeWindow([mark('bypassed')], 'chr1'), undefined)
})
