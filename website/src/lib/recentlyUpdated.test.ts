import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatDate } from './recentlyUpdated.ts'

describe('formatDate', () => {
  it('formats the UTC day a hub was first seen', () => {
    assert.equal(formatDate('2026-09-01T02:30:00.000Z'), 'Sep 1, 2026')
    assert.equal(formatDate('2026-09-01T23:59:59.000Z'), 'Sep 1, 2026')
  })
})
