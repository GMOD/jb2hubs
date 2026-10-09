import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { HPRC_GRAPH_BROWSER } from './pangenomeDataset.ts'
import {
  COMPLETE_PANEL_SIZE,
  PANEL_SIZE,
  annotatedHaplotypes,
  describeForm,
  structuralPanel,
} from './pangenomePanels.ts'
import { parseSvStateRow, structuralForms } from './pangenomeSvStates.ts'

import type { LaneConfig } from './pangenomePanels.ts'

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
      mayDrawEmpty: false,
    },
    {
      haplotype: 'A#1',
      shares: 5,
      structure: '1.7 kb deletion',
      mayDrawEmpty: false,
    },
  ])
  assert.equal(panel.forms, 2)
})

test('a form is described by its largest changes against the reference', () => {
  assert.equal(
    describeForm({ deltas: [], inversions: 0, uncalled: 0, rarer: 0 }),
    'as the reference',
  )
  assert.equal(
    describeForm({
      deltas: [-85_000, 300],
      inversions: 1,
      uncalled: 2,
      rarer: 0,
    }),
    '85 kb deletion, 300 bp insertion, inversion, not aligned at 2 sites',
  )
  assert.equal(
    describeForm({
      deltas: [-6100, 5000, -2700],
      inversions: 0,
      uncalled: 0,
      rarer: 0,
    }),
    '3 size changes, largest a 6.1 kb deletion',
  )
  assert.equal(
    describeForm({ deltas: [], inversions: 1, uncalled: 1, rarer: 0 }),
    'inversion, not aligned at 1 site',
  )
  assert.equal(
    describeForm({ deltas: [-3600], inversions: 0, uncalled: 0, rarer: 1 }),
    '3.6 kb deletion, a rarer change at 1 site',
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
