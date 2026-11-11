import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { descriptionAnchor, descriptionFile } from './descriptionLink.ts'

const SCRIPT = path.join(
  import.meta.dirname,
  '..',
  '..',
  'scripts',
  'checkTrackUrls.mjs',
)

// A built tree of one db whose one track links `html` and whose description
// page for `a+b` is on disk unless `page` is false.
function gate(html: string | undefined, { page = true, args = [''] } = {}) {
  const builtDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jb2hubs-gate-'))
  const dir = path.join(builtDir, 'zz1')
  fs.mkdirSync(path.join(dir, 'descriptions'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'a.bed.gz'), 'x')
  if (page) {
    fs.writeFileSync(
      path.join(dir, 'descriptions', descriptionFile('a+b')),
      '<p>about</p>',
    )
  }
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({
      assemblies: [],
      tracks: [
        {
          trackId: 'zz1-a+b',
          adapter: { bedGzLocation: { uri: 'a.bed.gz' } },
          metadata: { ucsc: html === undefined ? {} : { html } },
        },
      ],
    }),
  )
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--offline',
      '--built-dir',
      builtDir,
      '--state',
      path.join(builtDir, 'state.json'),
      ...args.filter(Boolean),
    ],
    { encoding: 'utf8' },
  )
  fs.rmSync(builtDir, { recursive: true })
  return { status: result.status, output: result.stdout + result.stderr }
}

describe('checkTrackUrls --offline, description pages', () => {
  it('passes when the linked page is on disk under its encoded name', () => {
    const { status, output } = gate(descriptionAnchor('zz1', 'a+b'))
    assert.equal(status, 0, output)
    assert.match(output, /2 relative/)
  })

  it('fails a link whose page is not in the built tree', () => {
    const { status, output } = gate(descriptionAnchor('zz1', 'a+b'), {
      page: false,
    })
    assert.equal(status, 1, output)
    assert.match(
      output,
      /FAIL {2}zz1\/zz1-a\+b: relative ref not on disk: descriptions\/a%2Bb\.html/,
    )
  })

  it("fails a link into another db's directory", () => {
    const { status, output } = gate(descriptionAnchor('zz2', 'a+b'))
    assert.equal(status, 1, output)
    assert.match(output, /is a description page under another db \(zz2\)/)
  })

  it('refuses a whole tree that links no description page', () => {
    const { status, output } = gate(undefined)
    assert.equal(status, 2, output)
    assert.match(output, /links a track description page/)
  })

  it('accepts no description page from the dbs --db names', () => {
    const { status, output } = gate(undefined, { args: ['--db', 'zz1'] })
    assert.equal(status, 0, output)
  })
})
