import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ALFA_POPULATIONS,
  ALFA_TRACK_ID,
  alfaPopulationsTrack,
  withAlfaPopulations,
} from './alfaPopulations.ts'

import type { Track } from './types.ts'

describe('alfaPopulationsTrack', () => {
  const track = alfaPopulationsTrack()
  const adapter = track.adapter as { subadapters: { source: string }[] }
  const [display] = track.displays as {
    type: string
    marks: {
      transform: { type: string; as: string }[]
      encoding: { y: string; color: { domain: string[]; range: string[] } }
    }[]
  }[]

  it('reads one bigBed per population, named by its source', () => {
    assert.deepEqual(
      adapter.subadapters.map(s => s.source),
      ALFA_POPULATIONS.map(p => p.id),
    )
  })

  it('draws the display only a v5 host has', () => {
    assert.equal(display?.type, 'LinearMarkDisplay')
  })

  it('plots a named field, so the tooltip says ALT_AF rather than jexl', () => {
    const [mark] = display!.marks
    assert.equal(mark!.encoding.y, 'ALT_AF')
    assert.deepEqual(
      mark!.transform.map(t => [t.type, t.as]),
      [['formula', 'ALT_AF']],
    )
  })

  it('pairs every population with its own color', () => {
    const { domain, range } = display!.marks[0]!.encoding.color
    assert.deepEqual(
      domain,
      ALFA_POPULATIONS.map(p => p.id),
    )
    assert.equal(new Set(range).size, domain.length)
  })
})

describe('withAlfaPopulations', () => {
  it('adds the track to hg38 only', () => {
    const hg38 = withAlfaPopulations({ tracks: [] as Track[] }, 'hg38')
    const hg19 = withAlfaPopulations({ tracks: [] as Track[] }, 'hg19')
    assert.deepEqual(
      hg38.tracks.map(t => t.trackId),
      [ALFA_TRACK_ID],
    )
    assert.deepEqual(hg19.tracks, [])
  })
})
