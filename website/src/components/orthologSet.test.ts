import assert from 'node:assert'
import { test } from 'node:test'

import { pickBySymbol } from './orthologSet.ts'

// The bug this exists for: NCBI's symbol lookups match aliases as well as
// symbols and do NOT rank the exact match first. Human `TTN` comes back as
// [7276 TTR (transthyretin), 7273 TTN (titin)] from both the Datasets symbol
// endpoint and an esearch `[Gene Name]`, so taking the first hit resolved titin
// to a 147 aa transthyretin — on this page and on the production /orthologs
// page, which shares this resolver.
test('an exact symbol match beats an alias hit that sorts first', () => {
  assert.strictEqual(
    pickBySymbol('TTN', [
      { gene_id: '7276', symbol: 'TTR' },
      { gene_id: '7273', symbol: 'TTN' },
    ]),
    '7273',
  )
})

test('symbol matching ignores case, so a typed lowercase symbol still wins', () => {
  assert.strictEqual(
    pickBySymbol('ttn', [
      { gene_id: '7276', symbol: 'TTR' },
      { gene_id: '7273', symbol: 'TTN' },
    ]),
    '7273',
  )
})

// Falling back to the first hit is what keeps an alias working: `p53` is nobody's
// symbol, and TP53 is the right answer.
test('with no exact match the first hit stands, so an alias still resolves', () => {
  assert.strictEqual(
    pickBySymbol('p53', [{ gene_id: '7157', symbol: 'TP53' }]),
    '7157',
  )
})

test('no candidates resolves to nothing, so the caller can fall through', () => {
  assert.strictEqual(pickBySymbol('NOTAGENE', []), undefined)
})

// A report carrying a symbol but no gene_id cannot be used even when it matches
// exactly; returning undefined sends the caller to its wider search rather than
// silently handing back a different gene's id.
test('an exact match without a gene_id does not fall through to another gene', () => {
  assert.strictEqual(
    pickBySymbol('TTN', [
      { gene_id: '7276', symbol: 'TTR' },
      { symbol: 'TTN' },
    ]),
    undefined,
  )
})
