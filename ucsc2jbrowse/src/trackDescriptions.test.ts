import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { descriptionAnchor } from './descriptionLink.ts'
import {
  descriptionPage,
  hasActiveMarkup,
  writeTrackDescriptions,
} from './trackDescriptions.ts'

import type { TrackDbEntry, UcscTrack } from './types.ts'

function entry(tableName: string, html: string): TrackDbEntry {
  return {
    tableName,
    settings: `track ${tableName}`,
    html,
    longLabel: tableName,
    grp: 'map',
    shortLabel: tableName,
    type: 'bigBed 6',
  }
}

function track(table: string, html?: string): UcscTrack {
  return {
    type: 'FeatureTrack',
    trackId: `hg38-${table}`,
    name: table,
    assemblyNames: ['hg38'],
    adapter: { type: 'BigBedAdapter' },
    metadata: { ucsc: html === undefined ? {} : { html } },
  }
}

function body(html: string) {
  return descriptionPage('hg38', 'umap', html).split('\n').slice(4).join('\n')
}

describe('descriptionPage', () => {
  it('resolves relative links against hgTrackUi', () => {
    assert.equal(
      body(
        [
          '<a href="../goldenPath/help/bigBed.html">a</a>',
          '<a href="../../FAQ/FAQformat.html#format1">b</a>',
          "<a href='/cgi-bin/hgTables'>c</a>",
          '<a HREF=hgTrackUi?db=hg38&amp;g=bismap>d</a>',
          '<img src="../images/umap.png">',
        ].join('\n'),
      ),
      [
        '<a href="https://genome.ucsc.edu/goldenPath/help/bigBed.html">a</a>',
        '<a href="https://genome.ucsc.edu/FAQ/FAQformat.html#format1">b</a>',
        '<a href="https://genome.ucsc.edu/cgi-bin/hgTables">c</a>',
        '<a HREF="https://genome.ucsc.edu/cgi-bin/hgTrackUi?db=hg38&amp;g=bismap">d</a>',
        '<img src="https://genome.ucsc.edu/images/umap.png">',
        '',
      ].join('\n'),
    )
  })

  it('leaves absolute links, mail links and in-page anchors alone', () => {
    const html = [
      '<a href="https://example.org/a?b=1&amp;c=2">a</a>',
      '<a href="mailto:genome@soe.ucsc.edu">b</a>',
      '<a href="#Methods">c</a>',
    ].join('\n')
    assert.equal(body(html), `${html}\n`)
  })

  it('is a utf-8 document that runs and submits nothing', () => {
    assert.equal(
      descriptionPage('hg38', 'umap', '<p>Umap</p>\n'),
      [
        '<!doctype html>',
        '<meta charset="utf-8">',
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; form-action 'none'">`,
        '<title>hg38 umap</title>',
        '<p>Umap</p>',
        '',
      ].join('\n'),
    )
  })
})

describe('hasActiveMarkup', () => {
  it('finds a script, frame, form, event handler or script url', () => {
    for (const html of [
      '<script>x</script>',
      '<SCRIPT src="x.js">',
      '<iframe src="x">',
      '<form action="hgTables">',
      '<img src="x.png" onerror="x()">',
      '<a href="javascript:x()">a</a>',
    ]) {
      assert.equal(hasActiveMarkup(html), true, html)
    }
  })

  it('passes prose that only mentions them', () => {
    assert.equal(
      hasActiveMarkup(
        '<p>The onset = 3 form of the <a href="x.html">manuscript</a></p>',
      ),
      false,
    )
  })
})

describe('writeTrackDescriptions', () => {
  const tracksDb = {
    umap: entry('umap', '<p>Umap</p>'),
    bismap: entry('bismap', '<p>Bismap</p>'),
    gap: entry('gap', ''),
  }

  function run(outRoot: string, tracks: UcscTrack[]) {
    return writeTrackDescriptions(outRoot).run({
      assemblyName: 'hg38',
      dir: path.join(outRoot, 'built'),
      dbDir: outRoot,
      genome: undefined,
      tracksDb,
      mitoCache: { codes: {}, fetchedAt: 0 },
      compareOnly: true,
      config: { assemblies: [], tracks },
    })
  }

  it('writes the pages the config links and removes the rest', async () => {
    const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jb2hubs-desc-'))
    const dir = path.join(outRoot, 'hg38', 'descriptions')
    const linked = (table: string) =>
      track(table, descriptionAnchor('hg38', table))
    assert.deepEqual(
      await run(outRoot, [linked('umap'), linked('bismap'), track('gap')]),
      { linked: 2, written: 2 },
    )
    assert.deepEqual(fs.readdirSync(dir).toSorted(), [
      'bismap.html',
      'umap.html',
    ])
    assert.deepEqual(await run(outRoot, [linked('umap'), linked('umap')]), {
      linked: 1,
      removed: 1,
    })
    assert.deepEqual(fs.readdirSync(dir), ['umap.html'])
    assert.equal(
      fs.readFileSync(path.join(dir, 'umap.html'), 'utf8'),
      descriptionPage('hg38', 'umap', '<p>Umap</p>'),
    )
    fs.rmSync(outRoot, { recursive: true })
  })

  it('unlinks a page with active markup instead of writing it', async () => {
    const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jb2hubs-desc-'))
    const tracks = [
      track('umap', descriptionAnchor('hg38', 'umap')),
      track('form', descriptionAnchor('hg38', 'form')),
    ]
    const counts = await writeTrackDescriptions(outRoot).run({
      assemblyName: 'hg38',
      dir: path.join(outRoot, 'built'),
      dbDir: outRoot,
      genome: undefined,
      tracksDb: { ...tracksDb, form: entry('form', '<form action="x">') },
      mitoCache: { codes: {}, fetchedAt: 0 },
      compareOnly: true,
      config: { assemblies: [], tracks },
    })
    assert.deepEqual(counts, { linked: 1, written: 1, refused: 1 })
    assert.deepEqual(tracks[1]?.metadata?.ucsc, {})
    assert.deepEqual(
      fs.readdirSync(path.join(outRoot, 'hg38', 'descriptions')),
      ['umap.html'],
    )
    fs.rmSync(outRoot, { recursive: true })
  })

  it('leaves a hub track linking its own page alone', async () => {
    const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jb2hubs-desc-'))
    assert.deepEqual(
      await run(outRoot, [
        track(
          'cat',
          '<a href="https://hgdownload.soe.ucsc.edu/gbdb/hs1/hubs/public/cat.html">cat.html</a>',
        ),
      ]),
      {},
    )
    fs.rmSync(outRoot, { recursive: true })
  })

  it('refuses a link with no trackDb page behind it', async () => {
    const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jb2hubs-desc-'))
    await assert.rejects(
      async () => run(outRoot, [track('x', descriptionAnchor('hg38', 'x'))]),
      /1 description links, 0 trackDb pages/,
    )
    fs.rmSync(outRoot, { recursive: true })
  })
})
