import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { splitTableRecords } from './utils/splitTableRecords.ts'

const records = (text: string) => [...splitTableRecords(text)]

describe('splitTableRecords', () => {
  it('joins backslash-continued lines into one record', () => {
    assert.deepEqual(records('a\\\nb\\\nc\\\n\n'), ['a\nb\nc\n'])
  })

  it('splits on the line that does not continue', () => {
    assert.deepEqual(records('a\\\n\nb\\\n\n'), ['a\n', 'b\n'])
  })

  // The bug this function exists for. hg16 and hg17's trackDb each carry one
  // lone \r inside an html blob; readline treated it as a line terminator, so
  // the record closed early and the remainder became a second entry with every
  // column shifted -- no `settings` field, which crashed the build. A \r that
  // is not followed by \n is content, not a line ending.
  it('does not treat a lone carriage return as a line ending', () => {
    assert.deepEqual(records('a\\\n<H2>Credits</H2>\r\\\nb\\\n\n'), [
      'a\n<H2>Credits</H2>\r\nb\n',
    ])
  })

  it('still strips a carriage return that is part of a CRLF', () => {
    assert.deepEqual(records('a\\\r\nb\\\r\n\r\n'), ['a\nb\n'])
  })

  it('yields nothing for empty input', () => {
    assert.deepEqual(records(''), [])
  })

  // A record is only emitted by its terminator line, so trailing content with
  // no terminator is still emitted when the file ends mid-record.
  it('emits a record terminated by end of input', () => {
    assert.deepEqual(records('a\\\nb\\\n'), ['a\nb\n'])
  })
})
