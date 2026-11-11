import assert from 'node:assert'
import { test } from 'node:test'

import { exampleFor, regionAnswer } from './pangenomeAnswer.ts'
import {
  ARABIDOPSIS_DATASET,
  BOVINE_DATASET,
  HPRC_DATASET,
  MOUSE_DATASET,
} from './pangenomeDataset.ts'
import { pangenomeExamples } from './pangenomeExamples.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'

test('the box deadline reaches the answer, not a fallback', async () => {
  const deadline = AbortSignal.abort(
    new DOMException('the box gave up', 'TimeoutError'),
  )
  await assert.rejects(
    regionAnswer(HPRC_DATASET, [], 'chr1:196,740,001-196,850,000', deadline),
    { name: 'TimeoutError' },
  )
})

test('a featured gene typed by name opens its example', () => {
  const examples = pangenomeExamples(HPRC_DATASET)
  const label = (text: string) => exampleFor(examples, text)?.label
  assert.equal(label('GSTT1'), 'GSTT1')
  assert.equal(label('lpa'), 'LPA')
  assert.equal(label('C4B'), 'C4A / C4B')
  assert.equal(label('CFHR'), 'CFH / CFHR')
  assert.equal(label('HLA'), 'HLA / MHC')
  assert.equal(label('ERBB2'), undefined)
})

test('a word of a label that is not one of its names opens no example', () => {
  const label = (dataset: PangenomeDataset, text: string) =>
    exampleFor(pangenomeExamples(dataset), text)?.label
  assert.equal(label(MOUSE_DATASET, 'a'), undefined)
  assert.equal(label(MOUSE_DATASET, 'agouti'), 'Agouti (a)')
  assert.equal(label(BOVINE_DATASET, 'I'), undefined)
  assert.equal(label(BOVINE_DATASET, 'class'), undefined)
  assert.equal(label(BOVINE_DATASET, 'bola class i'), 'BoLA class I')
  assert.equal(label(HPRC_DATASET, '1q23.3'), undefined)
})

test('a gene its example window only clips is left to the gene lookup', () => {
  const examples = pangenomeExamples(HPRC_DATASET)
  assert.equal(exampleFor(examples, 'CFH'), undefined)
  assert.equal(exampleFor(examples, 'RHCE'), undefined)
})

test('a sequence name opens the sequence, not an example', async () => {
  for (const [dataset, text, chrom] of [
    [HPRC_DATASET, '4', 'chr4'],
    [ARABIDOPSIS_DATASET, 'chr4', 'Chr4'],
  ] as const) {
    const answer = await regionAnswer(dataset, pangenomeExamples(dataset), text)
    assert.equal(answer.example, undefined)
    assert.equal(answer.region.chrom, chrom)
    assert.equal(answer.region.start, 0)
  }
})
