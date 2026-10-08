import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { launchHref } from './desktopPreference.ts'

const web =
  'https://jbrowse.org/code/jb2/main/?config=%2Fucsc%2Fhg38%2Fconfig.json&session=spec-%7B%22views%22%3A%5B%5D%7D'

describe('launchHref', () => {
  it('leaves a web launch alone by default', () => {
    assert.equal(launchHref(web, false), web)
  })

  it('wraps the same url for Desktop, and it round-trips', () => {
    const wrapped = new URL(launchHref(web, true))
    assert.equal(wrapped.protocol, 'jbrowse:')
    assert.equal(wrapped.searchParams.get('url'), web)
  })
})
