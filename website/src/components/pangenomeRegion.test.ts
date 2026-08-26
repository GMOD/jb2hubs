import assert from 'node:assert'
import { test } from 'node:test'

import { MAX_DETAIL_WINDOW_BP } from './pangenomeLoci.ts'
import {
  MAX_GRAPH_REGION_BP,
  formatRegion,
  parseRegion,
} from './pangenomeRegion.ts'

test('parseRegion takes a typed locstring and returns half-open coordinates', () => {
  for (const input of [
    'chr6:32,510,001-32,600,000',
    'chr6:32510001-32600000',
    ' chr6 : 32510001 .. 32600000 ',
  ]) {
    assert.deepEqual(parseRegion(input), {
      ok: true,
      chrom: 'chr6',
      start: 32_510_000,
      end: 32_600_000,
      wide: false,
    })
  }
})

test('parseRegion refuses what the view cannot navigate to', () => {
  assert.equal(parseRegion('chr6').ok, false)
  assert.equal(parseRegion('chr6:10-5').ok, false)
  assert.equal(parseRegion('chr6:0-5').ok, false)
  assert.equal(parseRegion(`chr1:1-${MAX_GRAPH_REGION_BP + 2}`).ok, false)
  assert.equal(parseRegion(`chr1:1-${MAX_GRAPH_REGION_BP}`).ok, true)
})

test('parseRegion flags a window past the readable ceiling without refusing it', () => {
  const r = parseRegion(`chr1:1-${MAX_DETAIL_WINDOW_BP + 1}`)
  assert.ok(r.ok && r.wide)
})

test('formatRegion round-trips through parseRegion', () => {
  const s = formatRegion('chr6', 32_510_000, 32_600_000)
  assert.equal(s, 'chr6:32,510,001-32,600,000')
  const r = parseRegion(s)
  assert.ok(r.ok)
  assert.equal(r.start, 32_510_000)
  assert.equal(r.end, 32_600_000)
})
