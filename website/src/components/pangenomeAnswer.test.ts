import assert from 'node:assert'
import { test } from 'node:test'

import { regionAnswer } from './pangenomeAnswer.ts'
import { HPRC_DATASET } from './pangenomeDataset.ts'

test('the box deadline reaches the answer, not a fallback', async () => {
  const deadline = AbortSignal.abort(
    new DOMException('the box gave up', 'TimeoutError'),
  )
  await assert.rejects(
    regionAnswer(HPRC_DATASET, [], 'chr1:196,740,001-196,850,000', deadline),
    { name: 'TimeoutError' },
  )
})
