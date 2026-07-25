import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildMultiWigTracks } from './mergeMultiWigTracks.ts'

import type { TrackDbEntry } from './types.ts'

function entry(
  tableName: string,
  settings: string[],
  shortLabel = tableName,
): TrackDbEntry {
  return {
    tableName,
    settings: settings.join('\n'),
    html: '',
    longLabel: tableName,
    grp: 'regulation',
    shortLabel,
    type: 'bigWig',
  }
}

const baseUrl = 'https://hgdownload.soe.ucsc.edu'

// One overlay container with two organ subtracks, plus an unrelated track, is
// the shape of every ENCODE 4 "(Layered)" composite.
const tracksDb: Record<string, TrackDbEntry> = {
  ctcf: entry(
    'ctcf',
    ['container multiWig', 'aggregate transparentOverlay', 'viewLimits 0:100'],
    'CTCF (Layered)',
  ),
  ctcfBlood: entry(
    'ctcfBlood',
    ['parent ctcf', 'bigDataUrl /gbdb/hg38/blood.bw', 'color 254,75,173'],
    'Blood',
  ),
  ctcfBrain: entry(
    'ctcfBrain',
    ['parent ctcf', 'bigDataUrl /gbdb/hg38/brain.bw'],
    'Brain',
  ),
  unrelated: entry('unrelated', ['bigDataUrl /gbdb/hg38/other.bw']),
}

describe('buildMultiWigTracks', () => {
  const { tracks, consumed } = buildMultiWigTracks({
    tracksDb,
    assemblyName: 'hg38',
    baseUrl,
  })

  it('builds one track per container, with a subadapter per subtrack', () => {
    assert.equal(tracks.length, 1)
    const track = tracks[0]!
    assert.equal(track.trackId, 'hg38-ctcf')
    assert.equal(track.name, 'CTCF (Layered)')
    assert.equal(track.type, 'MultiQuantitativeTrack')
    assert.equal(track.adapter.subadapters.length, 2)
  })

  it('labels each row with the subtrack shortLabel and absolutizes its url', () => {
    const [blood, brain] = tracks[0]!.adapter.subadapters
    assert.equal(blood!.name, 'Blood')
    assert.equal(
      blood!.bigWigLocation.uri,
      'https://hgdownload.soe.ucsc.edu/gbdb/hg38/blood.bw',
    )
    assert.equal(blood!.color, 'rgb(254,75,173)')
    // a subtrack with no UCSC color gets none, rather than an invented one
    assert.equal(brain!.color, undefined)
  })

  it('reports the subtracks it consumed, so they are not emitted individually', () => {
    assert.deepEqual([...consumed].sort(), ['ctcfBlood', 'ctcfBrain'])
    assert.ok(!consumed.has('unrelated'))
  })

  it('maps a UCSC overlay aggregate onto the overlapping rendering', () => {
    assert.deepEqual(tracks[0]!.displays, [
      { type: 'MultiLinearWiggleDisplay', defaultRendering: 'multixyplot' },
    ])
  })

  it('leaves a non-overlay container at the one-row-per-subtrack default', () => {
    const stacked = buildMultiWigTracks({
      tracksDb: {
        ...tracksDb,
        ctcf: entry('ctcf', ['container multiWig', 'aggregate stacked']),
      },
      assemblyName: 'hg38',
      baseUrl,
    })
    assert.equal(stacked.tracks[0]!.displays, undefined)
  })

  it('skips a container whose subtracks resolve to nothing', () => {
    const tableBacked = {
      layered: entry('layered', [
        'container multiWig',
        'aggregate transparentOverlay',
      ]),
      layeredK562: entry('layeredK562', ['parent layered']),
    }
    const built = buildMultiWigTracks({
      tracksDb: tableBacked,
      assemblyName: 'hg38',
      baseUrl,
    })
    assert.deepEqual(built.tracks, [])
    assert.equal(built.consumed.size, 0)
  })

  it('takes a subtrack file from its golden-path table when it has no bigDataUrl', () => {
    // the legacy layered composites: the file path lives in the table named by
    // the `table` setting, which differs from the track's own name
    const legacy = {
      layered: entry(
        'layered',
        ['container multiWig', 'aggregate transparentOverlay'],
        'Layered H3K27Ac',
      ),
      layeredGm12878: entry(
        'layeredGm12878',
        ['parent layered', 'table broadHistoneGm12878H3k27ac', 'color 255,0,0'],
        'GM12878',
      ),
    }
    const built = buildMultiWigTracks({
      tracksDb: legacy,
      assemblyName: 'hg19',
      baseUrl,
      resolveTable: table =>
        table === 'broadHistoneGm12878H3k27ac'
          ? `${baseUrl}/gbdb/hg19/bbi/broadHistoneGm12878H3k27ac.bigWig`
          : undefined,
    })
    assert.equal(built.tracks.length, 1)
    const [row] = built.tracks[0]!.adapter.subadapters
    assert.equal(row!.name, 'GM12878')
    assert.equal(
      row!.bigWigLocation.uri,
      'https://hgdownload.soe.ucsc.edu/gbdb/hg19/bbi/broadHistoneGm12878H3k27ac.bigWig',
    )
    assert.deepEqual([...built.consumed], ['layeredGm12878'])
  })

  it('keeps only the resolvable subtracks of a partly-resolvable container', () => {
    const mixed = {
      c: entry('c', ['container multiWig']),
      resolvable: entry('resolvable', ['parent c', 'table good']),
      unresolvable: entry('unresolvable', ['parent c', 'table missing']),
    }
    const built = buildMultiWigTracks({
      tracksDb: mixed,
      assemblyName: 'hg19',
      baseUrl,
      resolveTable: table =>
        table === 'good' ? `${baseUrl}/gbdb/hg19/bbi/good.bigWig` : undefined,
    })
    assert.equal(built.tracks[0]!.adapter.subadapters.length, 1)
    assert.deepEqual([...built.consumed], ['resolvable'])
  })

  it('leaves an already-absolute bigDataUrl alone', () => {
    const s3 = {
      c: entry('c', ['container multiWig']),
      kid: entry('kid', [
        'parent c',
        'bigDataUrl https://encode-public.s3.amazonaws.com/x.bw',
      ]),
    }
    const built = buildMultiWigTracks({
      tracksDb: s3,
      assemblyName: 'hg38',
      baseUrl,
    })
    assert.equal(
      built.tracks[0]!.adapter.subadapters[0]!.bigWigLocation.uri,
      'https://encode-public.s3.amazonaws.com/x.bw',
    )
  })
})
