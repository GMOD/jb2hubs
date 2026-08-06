import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { encodeGffAttribute } from './utils/encodeGffAttribute.ts'

describe('encodeGffAttribute', () => {
  it('encodes the GFF3 attribute delimiters', () => {
    assert.equal(encodeGffAttribute('a;b=c&d,e'), 'a%3Bb%3Dc%26d%2Ce')
  })

  // The omission that broke text-index. A raw CR inside an attribute value ends
  // the line for any reader that splits on it, leaving a fragment with fewer
  // than 9 columns -- which is how droPer1 ended up serving a 0-byte trix.
  it('encodes a raw carriage return', () => {
    assert.equal(encodeGffAttribute('Dper\ry'), 'Dper%0Dy')
  })

  it('encodes the other control characters that would break a row', () => {
    assert.equal(encodeGffAttribute('a\nb\tc'), 'a%0Ab%09c')
  })

  // UCSC pre-encodes its own delimiters, so encoding % here would double-encode
  // values that are already correct.
  it('leaves an existing percent-escape alone', () => {
    assert.equal(
      encodeGffAttribute('Dper-RA%3B GL24383-RA'),
      'Dper-RA%3B GL24383-RA',
    )
  })

  it('passes an ordinary value through unchanged', () => {
    assert.equal(encodeGffAttribute('XM_002013852.1'), 'XM_002013852.1')
  })
})
