import assert from 'node:assert'
import { test } from 'node:test'

import { BOVINE_DATASET, HPRC_DATASET } from './pangenomeDataset.ts'
import { structuralPanel } from './pangenomePanels.ts'
import {
  bp,
  carriersHere,
  percent,
  readingSentence,
  spoken,
  steps,
} from './pangenomeProse.ts'
import { parseSvStateRow, structuralForms } from './pangenomeSvStates.ts'

import type { Reading, RegionAnswer } from './pangenomeAnswer.ts'
import type { KnownAllele } from './pangenomeKnownAlleles.ts'

test('sizes read to two figures, in the unit that fits', () => {
  assert.equal(bp(79), '79 bp')
  assert.equal(bp(18_446), '18 kb')
  assert.equal(bp(1_567_699), '1.6 Mb')
  assert.equal(steps(950), '950')
  assert.equal(steps(14_310), '14 k')
})

test('a nonzero share under 1% reads <1%', () => {
  assert.equal(percent(0, 462), '0%')
  assert.equal(percent(3, 462), '<1%')
  assert.equal(percent(55, 462), '12%')
})

const allele = (label: string, inPanel = 'none'): KnownAllele => ({
  id: 'x',
  name: 'X',
  chrom: 'chr1',
  start: 120,
  end: 180,
  about: '',
  inPanel,
  drawn: [{ gain: false, bp: 1716, label }],
  citations: [],
})

// `carriers` of `haplotypes` carry a 1.7 kb deletion the allele is drawn as
function panelOf(haplotypes: string[], carriers: number) {
  const genotypes = haplotypes.map((_, i) => (i < carriers ? '1' : '0'))
  return structuralPanel(
    structuralForms(
      [parseSvStateRow(`chr1\t100\t200\tid\t1:-1700\t${genotypes.join('')}`)],
      haplotypes,
      1,
    ),
    { alleles: [allele('no X')] },
  )!
}

test("a small panel names an allele's carriers", () => {
  const haplotypes = ['ANG', 'BSW', 'HIG', 'PIE', 'SIM']
  assert.equal(
    carriersHere(
      BOVINE_DATASET,
      allele('no X'),
      panelOf(haplotypes, 2),
      haplotypes,
    ),
    'Here, no X: Angus and Brown Swiss.',
  )
  assert.equal(
    carriersHere(
      BOVINE_DATASET,
      allele('no X'),
      panelOf([...haplotypes, 'OBV'], 3),
      [...haplotypes, 'OBV'],
    ),
    'Here, no X: Angus, Brown Swiss and Highland.',
  )
})

test('a small panel names the few who lack an allele most carry', () => {
  const haplotypes = ['ANG', 'BSW', 'HIG', 'PIE', 'SIM']
  assert.equal(
    carriersHere(
      BOVINE_DATASET,
      allele('no X'),
      panelOf(haplotypes, 4),
      haplotypes,
    ),
    'Here, no X: all but Simmental.',
  )
})

test('a large panel counts the carriers among those aligned', () => {
  const haplotypes = Array.from({ length: 40 }, (_, i) => `HG${i}#1`)
  assert.equal(
    carriersHere(
      HPRC_DATASET,
      allele('no X'),
      panelOf(haplotypes, 10),
      haplotypes,
    ),
    'Here, no X: 10 of the 40 haplotypes aligned (25%).',
  )
})

test("an allele the map draws none of reads the allele's own count", () => {
  const haplotypes = ['ANG', 'BSW']
  assert.equal(
    carriersHere(
      BOVINE_DATASET,
      allele('something else', 'two of eleven'),
      panelOf(haplotypes, 1),
      haplotypes,
    ),
    'In this panel: two of eleven.',
  )
  assert.equal(
    carriersHere(BOVINE_DATASET, allele('no X', 'one'), undefined, []),
    'In this panel: one.',
  )
})

const reading = (r: Partial<Reading>): Reading => ({
  source: 'walks',
  haplotypes: 462,
  sites: 1,
  rareCarriers: 0,
  nonReferenceMajority: 0,
  matrixRows: { order: [], omitted: [] },
  ...r,
})

test('a reading with no panel says the haplotypes share one structure', () => {
  assert.equal(
    readingSentence(reading({ source: 'callset' }), 'GRCh38'),
    "The callset's 462 haplotypes share GRCh38's structure here.",
  )
  assert.equal(
    readingSentence(
      reading({ nonReferenceMajority: 2, rareCarriers: 1 }),
      'GRCh38',
    ),
    "The graph's 462 haplotypes share one structure here, which differs from GRCh38 at 2 sites. 1 haplotype also carries something rarer.",
  )
})

test('a reading with a panel counts its sites, forms and unplaced haplotypes', () => {
  const haplotypes = ['A#1', 'A#2', 'B#1', 'B#2', 'C#1']
  const panel = structuralPanel(
    structuralForms(
      [parseSvStateRow(`chr1\t100\t200\tid\t1:-1700\t11000`)],
      haplotypes,
      1,
    ),
  )!
  assert.equal(
    readingSentence(reading({ haplotypes: 5, panel }), 'GRCh38'),
    "1 structural variant site sorts the graph's 5 haplotypes into 2 forms that 1% or more carry.",
  )
  assert.equal(
    readingSentence(
      reading({
        haplotypes: 5,
        sites: 3,
        panel: { ...panel, unplaced: 2, lanes: panel.lanes.slice(0, 1) },
      }),
      'GRCh38',
    ),
    "3 structural variant sites sort the graph's 5 haplotypes into 2 forms that 1% or more carry, the 1 commonest below. 2 haplotypes are not aligned at any of them and have no lane.",
  )
})

test('the live region reads the title and the headline, or the reading', () => {
  const answer = (a: Partial<RegionAnswer>): RegionAnswer => ({
    region: { chrom: 'chr1', start: 100, end: 2000 },
    genes: [],
    named: [],
    alleles: [],
    launches: [],
    ...a,
  })
  assert.equal(spoken(answer({}), 'GRCh38'), 'chr1:101-2,000.')
  assert.equal(
    spoken(answer({ title: 'AMY1', reading: reading({}) }), 'GRCh38'),
    "AMY1. The graph's 462 haplotypes share GRCh38's structure here.",
  )
  const haplotypes = ['A#1', 'A#2', 'B#1', 'B#2']
  const panel = structuralPanel(
    structuralForms(
      [parseSvStateRow(`chr1\t100\t200\tid\t1:-1700\t1100`)],
      haplotypes,
      1,
    ),
  )!
  assert.match(
    spoken(answer({ title: 'X', reading: reading({ panel }) }), 'GRCh38'),
    /^X\. Largest common change: 1\.7 kb deletion, in 50% of haplotypes aligned there\./,
  )
})
