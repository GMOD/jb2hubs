import assert from 'node:assert'
import { test } from 'node:test'

import {
  ARABIDOPSIS_DATASET,
  BOVINE_DATASET,
  HPRC_DATASET,
  MOUSE_DATASET,
  PANGENOME_DATASETS,
} from './pangenomeDataset.ts'
import { pangenomeExamples } from './pangenomeExamples.ts'
import { MAX_DETAIL_WINDOW_BP } from './pangenomeLoci.ts'
import { parseRegion } from './pangenomeRegion.ts'

test('a locus is an example under its own name, on its launch window', () => {
  const examples = pangenomeExamples(HPRC_DATASET)
  assert.deepEqual(
    HPRC_DATASET.loci.filter(l => l.unlisted).map(l => l.id),
    ['smn', 'srgap2', 'defb'],
  )
  assert.equal(examples.length, HPRC_DATASET.loci.length - 3)
  assert.ok(!examples.some(e => e.id === 'smn'))
  assert.deepEqual(examples[0], {
    id: 'mhc-hla',
    label: 'HLA / MHC',
    description: 'Major histocompatibility complex',
    region: 'chr6:32,510,001-32,600,000',
  })
  assert.deepEqual(pangenomeExamples(ARABIDOPSIS_DATASET).at(-1), {
    id: 'knob',
    label: 'Chr4 knob',
    description: 'Chromosome 4 knob inversion',
    region: 'Chr4:1,558,001-2,839,000',
  })
})

test('every dataset names its examples once each', () => {
  for (const d of PANGENOME_DATASETS) {
    const examples = pangenomeExamples(d)
    assert.ok(examples.length > 0, `${d.id} has examples`)
    for (const key of ['id', 'label', 'region'] as const) {
      const values = examples.map(e => e[key])
      assert.equal(new Set(values).size, values.length, `${d.id}: ${values}`)
    }
    for (const e of examples) {
      assert.ok(e.description, `${d.id}/${e.id} has a description`)
    }
  }
})

test('every example asks for a region the box reads back, inside the graph', () => {
  for (const d of PANGENOME_DATASETS) {
    for (const e of pangenomeExamples(d)) {
      const region = parseRegion(e.region)
      assert.ok(region, `${d.id}: ${e.region}`)
      const sequence = d.graphBrowser.chromosomes.find(
        c => c.name === region.chrom,
      )
      assert.ok(sequence, `${d.id}/${e.id}: ${region.chrom} is in the graph`)
      assert.ok(region.end <= sequence.length, `${d.id}/${e.id} is on it`)
    }
  }
})

// Each of these shows one structure wider than 150 kb, so its window is that
// structure and opens from the coarse tier.
const WIDE_ON_PURPOSE: Record<string, string[]> = {
  bovine: ['defb'],
  arabidopsis: ['knob'],
}

test('a non-human example is drawn at segment level, but for the listed ones', () => {
  for (const d of [MOUSE_DATASET, BOVINE_DATASET, ARABIDOPSIS_DATASET]) {
    assert.deepEqual(
      d.loci.filter(l => l.end - l.start > MAX_DETAIL_WINDOW_BP).map(l => l.id),
      WIDE_ON_PURPOSE[d.id] ?? [],
      d.id,
    )
  }
})
