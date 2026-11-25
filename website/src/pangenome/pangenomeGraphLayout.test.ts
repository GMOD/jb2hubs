import assert from 'node:assert'
import { test } from 'node:test'

import { litSwatches } from './pangenomeGraphLayout.ts'

const BLUE = 'rgb(52, 132, 182)'
const ORANGE = 'rgb(221, 125, 50)'

test('each lit row whose thread is lifted takes that thread’s colour', () => {
  assert.deepEqual(
    litSwatches(
      [
        { picks: ['GRCh38#0#chr1'], swatch: BLUE },
        { picks: ['HG002#1#chr1'], swatch: ORANGE },
      ],
      ['GRCh38', 'HG002'],
    ),
    [
      { haplotype: 'GRCh38', swatch: BLUE },
      { haplotype: 'HG002', swatch: ORANGE },
    ],
  )
})

test('a row on a thread an earlier row lit gets no colour', () => {
  assert.deepEqual(
    litSwatches(
      [
        { picks: ['GRCh38#0#chr1', 'HG002#1#chr1'], swatch: BLUE },
        { picks: ['HG005#2#chr1'], swatch: ORANGE },
      ],
      ['GRCh38', 'HG002', 'HG005'],
    ),
    [
      { haplotype: 'GRCh38', swatch: BLUE },
      { haplotype: 'HG005', swatch: ORANGE },
    ],
  )
})

test('a lit row with no thread drawn gets no colour', () => {
  assert.deepEqual(
    litSwatches(
      [{ picks: ['GRCh38#0#chr1'], swatch: BLUE }],
      ['GRCh38', 'HG002'],
    ),
    [{ haplotype: 'GRCh38', swatch: BLUE }],
  )
})

test('a haplotype is not taken for another whose name it begins', () => {
  assert.deepEqual(
    litSwatches([{ picks: ['HG0021#1#chr1'], swatch: BLUE }], ['HG002']),
    [],
  )
})
