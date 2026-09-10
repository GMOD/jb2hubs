import assert from 'node:assert'
import { test } from 'node:test'

import { MAX_DETAIL_WINDOW_BP } from './pangenomeLoci.ts'
import { formatRegion, parseRegion } from './pangenomeRegion.ts'

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
      coarse: false,
    })
  }
})

test('parseRegion refuses what the view cannot navigate to', () => {
  assert.equal(parseRegion('chr6').ok, false)
  assert.equal(parseRegion('chr6:10-5').ok, false)
  assert.equal(parseRegion('chr6:0-5').ok, false)
})

// A whole chromosome used to be refused outright, because the fine lanes and
// the 5 Mb `maxRegionBp` default could not take it. It is now the coarse
// branch's job, so the parser passes it through and flags it.
test('parseRegion flags a wide window as coarse rather than refusing it', () => {
  const detail = parseRegion(`chr1:1-${MAX_DETAIL_WINDOW_BP}`)
  assert.ok(detail.ok && !detail.coarse)
  const wide = parseRegion(`chr1:1-${MAX_DETAIL_WINDOW_BP + 1}`)
  assert.ok(wide.ok && wide.coarse)
  const chromosome = parseRegion('chr1:1-248,956,422')
  assert.ok(chromosome.ok && chromosome.coarse)
})

test('formatRegion round-trips through parseRegion', () => {
  const s = formatRegion('chr6', 32_510_000, 32_600_000)
  assert.equal(s, 'chr6:32,510,001-32,600,000')
  const r = parseRegion(s)
  assert.ok(r.ok)
  assert.equal(r.start, 32_510_000)
  assert.equal(r.end, 32_600_000)
})
