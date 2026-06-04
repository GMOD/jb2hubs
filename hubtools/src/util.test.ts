/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isUsableMafSummary } from './util.ts'

describe('isUsableMafSummary', () => {
  it('accepts a proper mafSummary bigBed', () => {
    assert.ok(
      isUsableMafSummary(
        'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/cactus447way/cactus447waySummary.bb',
      ),
    )
  })

  it('rejects degenerate tinySummary.bb placeholders (gbdb path or url)', () => {
    assert.ok(!isUsableMafSummary('/gbdb/hg38/cactus241way/tinySummary.bb'))
    assert.ok(
      !isUsableMafSummary(
        'https://hgdownload.soe.ucsc.edu/gbdb/hg38/cactus241way/tinySummary.bb',
      ),
    )
  })

  it('rejects undefined', () => {
    assert.ok(!isUsableMafSummary(undefined))
  })
})
