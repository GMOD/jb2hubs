import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { assertMostlyPublished } from './publishedHubs.ts'

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
