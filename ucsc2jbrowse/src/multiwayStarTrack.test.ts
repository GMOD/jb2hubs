import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { alignmentSettings, multiwayStarTrack } from './multiwayStarTrack.ts'

import type { JBrowseConfig, UcscGenome, UcscTrack } from './types.ts'

function chain(anchor: string, mate: string, suffix = 'liftOver'): UcscTrack {
  return {
    type: 'SyntenyTrack',
    trackId: `${anchor}_to_${mate}_${suffix}`,
    name: `${anchor} to ${mate} ${suffix}`,
    assemblyNames: [anchor, mate],
    adapter: {
      type: 'PairwiseIndexedPAFAdapter',
      targetAssembly: anchor,
      queryAssembly: mate,
      pifGzLocation: { uri: `liftOver/${anchor}To${mate}.over.pif.gz` },
    },
  }
}

const genomes: Record<string, UcscGenome> = {
  hg38: {
    id: 'hg38',
    description: '',
    defaultPos: '',
    organism: 'Human',
    orderKey: 50,
  },
  hg19: {
    id: 'hg19',
    description: '',
    defaultPos: '',
    organism: 'Human',
    orderKey: 60,
  },
  panTro5: {
    id: 'panTro5',
    description: '',
    defaultPos: '',
    organism: 'Chimp',
    orderKey: 3300,
  },
  panTro6: {
    id: 'panTro6',
    description: '',
    defaultPos: '',
    organism: 'Chimp',
    orderKey: 3325,
  },
  mm39: {
    id: 'mm39',
    description: '',
    defaultPos: '',
    organism: 'Mouse',
    orderKey: 269,
  },
  galGal6: {
    id: 'galGal6',
    description: '',
    defaultPos: '',
    organism: 'Chicken',
    orderKey: 9000,
  },
}

function config(tracks: UcscTrack[]): JBrowseConfig {
  return { assemblies: [], tracks }
}

const star = (
  tracks: UcscTrack[],
  labelOf = (_: string) => '',
  trackDb: Record<string, string>[] = [],
) =>
  multiwayStarTrack({
    config: config(tracks),
    assemblyName: 'hg38',
    genomes,
    labelOf,
    geneTrackId: 'hg38-ncbiRefSeq',
    alignments: alignmentSettings(config(tracks), trackDb),
  })

describe('multiwayStarTrack', () => {
  it('stars every liftOver pair the config holds, one child per mate', () => {
    const track = star([
      chain('hg38', 'panTro6'),
      chain('hg38', 'panTro6', 'liftOver_chainBridge'),
      chain('hg38', 'mm39'),
      chain('hg38', 'galGal6'),
      { ...chain('mm39', 'hg38'), trackId: 'mm39_to_hg38_liftOver' },
    ])!
    const adapter = track.adapter as { adapters: { queryAssembly: string }[] }
    assert.deepEqual(
      adapter.adapters.map(child => child.queryAssembly).sort(),
      ['galGal6', 'mm39', 'panTro6'],
    )
    assert.equal(track.trackId, 'hg38_liftOver_multiway')
    assert.deepEqual(track.displays, [
      {
        type: 'MultiWaySyntenyDisplay',
        displayId: 'hg38_liftOver_multiway-MultiWaySyntenyDisplay',
        height: 90,
        laneGeneTracks: ['hg38-ncbiRefSeq'],
      },
    ])
  })

  it('needs three mates', () => {
    assert.equal(
      star([chain('hg38', 'panTro6'), chain('hg38', 'mm39')]),
      undefined,
    )
  })

  it('opens on the newest assembly of each other organism, in UCSC list order', () => {
    const track = star(
      ['hg19', 'panTro5', 'panTro6', 'mm39', 'galGal6'].map(mate =>
        chain('hg38', mate),
      ),
    )!
    assert.deepEqual(track.assemblyNames, [
      'hg38',
      'mm39',
      'panTro6',
      'galGal6',
    ])
  })

  it("opens on the anchor alignment's curated species, grouped by its clades", () => {
    const multiz: UcscTrack = {
      trackId: 'hg38-multiz470way',
      name: 'Multiz',
      assemblyNames: ['hg38'],
      adapter: { type: 'BigMafAdapter' },
      metadata: {
        ucsc: {
          speciesDefaultOn: 'galGal6 HLfoo1 panTro6',
          speciesGroups: 'Primates Birds',
          sGroup_Primates: 'panTro5 panTro6',
          sGroup_Birds: 'galGal6',
        },
      },
    }
    const track = star(
      [
        ...['galGal6', 'mm39', 'panTro6', 'panTro5'].map(m => chain('hg38', m)),
        multiz,
      ],
      mate => (mate === 'mm39' ? 'Mouse (mm39)' : ''),
    )!
    assert.deepEqual(track.assemblyNames, ['hg38', 'galGal6', 'panTro6'])
    assert.deepEqual((track.adapter as { lanes: unknown[] }).lanes, [
      { name: 'panTro5', group: 'Primates' },
      { name: 'panTro6', group: 'Primates' },
      { name: 'galGal6', group: 'Birds' },
      { name: 'mm39', label: 'Mouse (mm39)' },
    ])
  })
  it('reads the curated species off a trackDb alignment that was never converted', () => {
    const track = star(
      ['galGal6', 'mm39', 'panTro6'].map(m => chain('hg38', m)),
      undefined,
      [
        { track: 'multiz20way', speciesDefaultOn: 'panTro6' },
        { track: 'multiz100way', speciesDefaultOn: 'mm39 galGal6 danRer11' },
        { track: 'knownGene', shortLabel: 'genes' },
      ],
    )!
    assert.deepEqual(track.assemblyNames, ['hg38', 'mm39', 'galGal6'])
  })
})
