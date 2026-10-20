import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { assertMostlyPublished, assertNoSharpShrink } from './publishedHubs.ts'

describe('assertMostlyPublished', () => {
  it('accepts the handful UCSC lists and never published', () => {
    assertMostlyPublished(23, 53113)
  })

  it('refuses when the hubs tree is missing', () => {
    assert.throws(() => {
      assertMostlyPublished(53113, 53113)
    }, /refusing/)
  })
})

describe('assertNoSharpShrink', () => {
  it('accepts growth, small churn and a first run', () => {
    assertNoSharpShrink(53123, 53140, false)
    assertNoSharpShrink(53123, 52000, false)
    assertNoSharpShrink(undefined, 100, false)
  })

  it('refuses the loss of a whole category', () => {
    assert.throws(() => {
      assertNoSharpShrink(53123, 38646, false)
    }, /refusing/)
  })

  it('lets an override through', () => {
    assertNoSharpShrink(53123, 38646, true)
  })
})
