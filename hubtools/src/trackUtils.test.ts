import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createHtmlLink } from './trackUtils.ts'

const trackDbUrl = 'https://example.com/hub/hg38/trackDb.txt'

describe('createHtmlLink', () => {
  it('resolves against the trackDb', () => {
    assert.equal(
      createHtmlLink('html/mane.html', trackDbUrl),
      '<a href="https://example.com/hub/hg38/html/mane.html">html/mane.html</a>',
    )
  })

  it('cannot break out of the attribute or the tag', () => {
    const link = createHtmlLink('x" onerror="alert(1)', trackDbUrl)
    assert.ok(!link.includes('onerror="'))
    assert.ok(link.includes('&quot;'))
  })
})
