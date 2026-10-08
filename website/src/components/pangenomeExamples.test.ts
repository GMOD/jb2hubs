import assert from 'node:assert'
import { test } from 'node:test'

import {
  ARABIDOPSIS_DATASET,
  BOVINE_DATASET,
  HPRC_DATASET,
  MOUSE_DATASET,
} from './pangenomeDataset.ts'
import { MAX_DERIVED_EXAMPLES, pangenomeExamples } from './pangenomeExamples.ts'
import { parseRegion } from './pangenomeRegion.ts'

test('a curated locus is an example under its own name, on its launch window', () => {
  const examples = pangenomeExamples(HPRC_DATASET)
  assert.equal(examples.length, HPRC_DATASET.loci.length)
  assert.deepEqual(examples[0], {
    id: 'mhc-hla',
    label: 'HLA / MHC',
    description: 'Major histocompatibility complex',
    region: 'chr6:32,510,001-32,600,000',
    graphCollapsed: false,
  })
  assert.equal(examples.find(e => e.label === 'CYP2D6')?.graphCollapsed, true)
})

test('a derived catalogue offers its top bubbles that overlap a gene, once each', () => {
  for (const d of [MOUSE_DATASET, BOVINE_DATASET, ARABIDOPSIS_DATASET]) {
    const examples = pangenomeExamples(d)
    assert.ok(examples.length > 0, `${d.id} has examples`)
    assert.ok(examples.length <= MAX_DERIVED_EXAMPLES)
    const labels = examples.map(e => e.label)
    assert.equal(new Set(labels).size, labels.length, `${d.id}: ${labels}`)
    for (const e of examples) {
      assert.doesNotMatch(e.label, /:|,|\(/, `${d.id}: ${e.label}`)
      assert.match(e.description, /^one bubble of [\d,]+ segments$/)
    }
  }
  assert.deepEqual(
    pangenomeExamples(MOUSE_DATASET)
      .slice(0, 4)
      .map(e => e.label),
    ['Vmn cluster', 'Gm10439 +10', 'Eif cluster', 'Dock2'],
  )
})

test('every example asks for a region the box reads back', () => {
  for (const d of [
    HPRC_DATASET,
    MOUSE_DATASET,
    BOVINE_DATASET,
    ARABIDOPSIS_DATASET,
  ]) {
    for (const e of pangenomeExamples(d)) {
      assert.ok(parseRegion(e.region), `${d.id}: ${e.region}`)
    }
  }
})
