import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ALFA_POPULATIONS,
  ALFA_TRACK_ID,
  ALFA_VCF,
  alfaPopulationsTrack,
  withAlfaPopulations,
} from './alfaPopulations.ts'

import type { Track } from './types.ts'

describe('alfaPopulationsTrack', () => {
  const track = alfaPopulationsTrack()
  const adapter = track.adapter as {
    type: string
    vcfGzLocation: { uri: string }
    index: { location: { uri: string } }
  }
  const [display] = track.displays as {
    type: string
    scales: { y: { domainMin: number; domainMax: number } }
    marks: {
      transform: { type: string; key?: string; as?: string }[]
      encoding: {
        y: string
        color: {
          field: string
          domain: string[]
          range: string[]
        }
      }
    }[]
  }[]
  const mark = display!.marks[0]!

  it('reads the ALFA VCF beside its tabix index', () => {
    assert.equal(adapter.type, 'VcfTabixAdapter')
    assert.equal(adapter.vcfGzLocation.uri, ALFA_VCF)
    assert.equal(adapter.index.location.uri, `${ALFA_VCF}.tbi`)
  })

  it('draws the display only a v5 host has', () => {
    assert.equal(display?.type, 'LinearMarkDisplay')
  })

  it('fans each site out per column, names it, then computes and filters its AF', () => {
    assert.deepEqual(
      mark.transform.map(t => [t.type, t.key ?? t.as]),
      [
        ['flatten', 'sample'],
        ['formula', 'population'],
        ['formula', 'ALT_AF'],
        ['filter', undefined],
      ],
    )
  })

  it('colors by population name, so details and tooltip show names', () => {
    assert.equal(mark.encoding.color.field, 'population')
  })

  it('plots a named field, so the tooltip says ALT_AF rather than jexl', () => {
    assert.equal(mark.encoding.y, 'ALT_AF')
  })

  it('pins the axis to 0–1, so a window of rare variants does not fill it', () => {
    const { domainMin, domainMax } = display!.scales.y
    assert.deepEqual([domainMin, domainMax], [0, 1])
  })

  it('names and colors every BioSample column once', () => {
    const { domain, range } = mark.encoding.color
    assert.deepEqual(
      domain,
      ALFA_POPULATIONS.map(p => p.name),
    )
    assert.equal(new Set(ALFA_POPULATIONS.map(p => p.biosample)).size, 12)
    assert.equal(new Set(domain).size, 12)
    assert.equal(new Set(range).size, 12)
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
