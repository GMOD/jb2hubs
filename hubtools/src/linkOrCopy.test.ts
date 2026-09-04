import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { linkOrCopy } from './util.ts'

describe('linkOrCopy', () => {
  it('links on the same device and leaves a current link alone', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-'))
    const src = path.join(dir, 'a')
    const dest = path.join(dir, 'b')
    fs.writeFileSync(src, 'x')
    linkOrCopy(src, dest)
    assert.equal(fs.statSync(dest).ino, fs.statSync(src).ino)
    const before = fs.statSync(dest)
    linkOrCopy(src, dest)
    assert.deepEqual(fs.statSync(dest), before)
  })

  it('replaces a stale copy and recognizes a fresh one by size and mtime', () => {
    // A copy is what a cross-device fallback leaves; the same test doubles as
    // the "different inode, same content" case a copy always is.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-'))
    const src = path.join(dir, 'a')
    const dest = path.join(dir, 'b')
    fs.writeFileSync(src, 'new')
    fs.writeFileSync(dest, 'old')
    const stale = new Date(Date.now() - 60_000)
    fs.utimesSync(dest, stale, stale)
    linkOrCopy(src, dest)
    assert.equal(fs.readFileSync(dest, 'utf8'), 'new')

    fs.rmSync(dest)
    fs.copyFileSync(src, dest)
    const s = fs.statSync(src)
    fs.utimesSync(dest, s.atime, s.mtime)
    const before = fs.statSync(dest)
    linkOrCopy(src, dest)
    assert.equal(fs.statSync(dest).ino, before.ino)
  })

  // The filesystem keeps sub-millisecond mtimes and a Date does not, so the
  // stamp linkOrCopy writes lands either side of the whole millisecond. When it
  // landed on the far side, comparing floors re-copied a current file -- which
  // is what made the case above fail about half the times it ran.
  it('recognizes a stamp that rounded across the millisecond', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-'))
    const src = path.join(dir, 'a')
    const dest = path.join(dir, 'b')
    fs.writeFileSync(src, 'new')
    fs.copyFileSync(src, dest)
    fs.utimesSync(src, 1_700_000_000.65068, 1_700_000_000.65068)
    fs.utimesSync(dest, 1_700_000_000.651, 1_700_000_000.651)
    const before = fs.statSync(dest)
    assert.notEqual(
      Math.floor(before.mtimeMs),
      Math.floor(fs.statSync(src).mtimeMs),
    )
    linkOrCopy(src, dest)
    assert.equal(fs.statSync(dest).ino, before.ino)
  })
})
