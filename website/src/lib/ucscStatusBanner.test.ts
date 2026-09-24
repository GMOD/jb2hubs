import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bannerText } from './ucscStatusBanner.ts'

test('a healthy or inconclusive probe renders nothing', () => {
  assert.equal(bannerText({ verdict: 'ok', elapsedMs: 200, at: 0 }), undefined)
  assert.equal(
    bannerText({ verdict: 'unknown', elapsedMs: 6000, at: 0 }),
    undefined,
  )
})

test('a stall says the host hangs, and what will not open', () => {
  const text = bannerText({ verdict: 'stalled', elapsedMs: 6000, at: 0 })!
  assert.equal(text.headline, "UCSC's download server is not responding")
  assert.match(text.detail, /accepting connections without answering/)
  assert.match(text.consequences[0]!, /track served from UCSC will hang/)
  assert.match(text.consequences[1]!, /GenArk assemblies .* will not open/)
})

test('a slow answer names the time and hedges the consequences', () => {
  const text = bannerText({ verdict: 'slow', elapsedMs: 3456, at: 0 })!
  assert.equal(
    text.headline,
    "UCSC's download server is responding slowly (3.5s)",
  )
  assert.match(text.consequences[0]!, /may hang/)
  assert.match(text.consequences[1]!, /may not open/)
})
