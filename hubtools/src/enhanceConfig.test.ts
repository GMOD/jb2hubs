import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { enhanceConfigObject } from './enhanceConfig.ts'

import type { JBrowseConfig, JBrowsePlugin, Track } from './types.ts'

interface EnhancedDisplay {
  type: string
  displayId: string
  labels: { name: string }
  filter?: unknown
  height?: number
  showOnlyGenes?: unknown
  tooltip?: string
  color?: unknown
  encoding: { color: { field?: string; scale: { type: string } } }
  rows: { field: string }
}

type EnhancedTrack = {
  trackId: string
  displays: [EnhancedDisplay, ...EnhancedDisplay[]]
  displayDefaults: EnhancedDisplay
  formatDetails: { feature: string }
}

interface EnhancedConfig {
  tracks: [EnhancedTrack, ...EnhancedTrack[]]
  plugins: JBrowsePlugin[]
}

function enhanced(config: JBrowseConfig, plugins: JBrowsePlugin[]) {
  const roundTripped: unknown = JSON.parse(
    JSON.stringify(enhanceConfigObject(structuredClone(config), { plugins })),
  )
  return roundTripped as EnhancedConfig
}

function runOnConfig(tracks: Track[]) {
  return enhanced({ tracks }, []).tracks
}

function runOnPlugins(config: JBrowseConfig, plugins: JBrowsePlugin[]) {
  return enhanced(config, plugins).plugins
}

describe('enhanceConfig feature display derivation', () => {
  it('derives a display for a FeatureTrack from metadata.ucsc', () => {
    const [t] = runOnConfig([
      {
        trackId: 'a-ncbiGene',
        type: 'FeatureTrack',
        metadata: { ucsc: { defaultLabelFields: 'geneName2' } },
      },
    ])
    assert.equal(t.displays[0].labels.name, "jexl:get(feature,'geneName2')")
  })

  it('leaves a hand-authored display untouched', () => {
    const existing = [{ type: 'LinearBasicDisplay', displayId: 'custom' }]
    const [t] = runOnConfig([
      {
        trackId: 'a-ncbiGene',
        type: 'FeatureTrack',
        displays: existing,
        metadata: { ucsc: { defaultLabelFields: 'geneName2' } },
      },
    ])
    assert.deepEqual(t.displays, existing)
  })

  it('refreshes the entry it wrote on a previous run', () => {
    const [t] = runOnConfig([
      {
        trackId: 'a-jaspar',
        type: 'FeatureTrack',
        displays: [
          {
            type: 'LinearBasicDisplay',
            displayId: 'a-jaspar-LinearBasicDisplay',
            labels: { name: "jexl:get(feature,'TFName')" },
            height: 200,
          },
        ],
        metadata: {
          ucsc: {
            defaultLabelFields: 'TFName',
            'filter.score': '400',
            'filterByRange.score': '0:1000',
          },
        },
      },
    ])
    assert.deepEqual(t.displayDefaults.filter, [{ field: 'score', gte: 400 }])
    assert.equal('filter' in t.displays[0], false)
    // a key this deriver does not own survives the refresh
    assert.equal(t.displays[0].height, 200)
  })

  it('drops a derived key whose trackDb setting has gone away', () => {
    const [t] = runOnConfig([
      {
        trackId: 'a-x',
        type: 'FeatureTrack',
        displays: [
          {
            type: 'LinearBasicDisplay',
            displayId: 'a-x-LinearBasicDisplay',
            labels: { name: "jexl:get(feature,'old')" },
            tooltip: "jexl:get(feature,'old')",
          },
        ],
        metadata: { ucsc: { defaultLabelFields: 'new' } },
      },
    ])
    assert.equal(t.displays[0].labels.name, "jexl:get(feature,'new')")
    assert.equal('tooltip' in t.displays[0], false)
  })

  it('hides the sidecar offset columns a detailsTabUrls track carries', () => {
    const [t] = runOnConfig([
      {
        trackId: 'a-gnomad',
        type: 'FeatureTrack',
        metadata: {
          ucsc: { detailsTabUrls: '_dataOffset=/gbdb/hg38/x/details.tab.gz' },
        },
      },
    ])
    assert.equal(
      t.formatDetails.feature,
      'jexl:{_dataOffset:undefined,_dataLen:undefined}',
    )
  })

  it('leaves a hand-authored formatDetails alone', () => {
    const [t] = runOnConfig([
      {
        trackId: 'a-gnomad',
        type: 'FeatureTrack',
        formatDetails: { feature: 'jexl:{mine:1}' },
        metadata: {
          ucsc: { detailsTabUrls: '_dataOffset=/gbdb/hg38/x/details.tab.gz' },
        },
      },
    ])
    assert.equal(t.formatDetails.feature, 'jexl:{mine:1}')
  })

  it("points ncbiOrtho's relative hgTracks links at /ucsc/launch/", () => {
    const [t] = runOnConfig([
      {
        trackId: 'hg38-ncbiOrtho',
        type: 'FeatureTrack',
        metadata: { ucsc: { track: 'ncbiOrtho', mouseOver: '$url' } },
      },
    ])
    assert.equal(
      t.formatDetails.feature,
      `jexl:{url:feature.url?replaceAll(feature.url,'href="hgTracks?','href="https://genomes.jbrowse.org/ucsc/launch/?'):feature.url}`,
    )
  })

  it('hides columns and rewrites links in one formatDetails', () => {
    const [t] = runOnConfig([
      {
        trackId: 'a-ncbiOrtho',
        type: 'FeatureTrack',
        metadata: {
          ucsc: {
            track: 'ncbiOrtho',
            detailsTabUrls: '_dataOffset=/gbdb/hg38/x/details.tab.gz',
          },
        },
      },
    ])
    assert.match(
      t.formatDetails.feature,
      /^jexl:\{_dataOffset:undefined,_dataLen:undefined,url:feature\.url\?/,
    )
  })

  it('links trackDb url only when told the UCSC db', () => {
    const track = () => ({
      trackId: 'hg38-ucscToRefSeq',
      type: 'FeatureTrack',
      adapter: { type: 'BedTabixAdapter' },
      metadata: {
        ucsc: { track: 'ucscToRefSeq', url: 'https://x/$$?db=$D' },
      },
    })
    const genark = enhanceConfigObject({ tracks: [track()] })
    assert.equal('formatDetails' in genark.tracks![0]!, false)
    const ucsc = enhanceConfigObject({ tracks: [track()] }, { ucscDb: 'hg38' })
    assert.match(
      String((ucsc.tracks![0]!.formatDetails as { feature: string }).feature),
      /'hg38'/,
    )
  })

  it('sets no formatDetails on a track that needs none', () => {
    const [t] = runOnConfig([
      {
        trackId: 'a-x',
        type: 'FeatureTrack',
        metadata: { ucsc: { defaultLabelFields: 'name' } },
      },
    ])
    assert.equal('formatDetails' in t, false)
  })

  it('skips non-FeatureTracks and tracks without ucsc metadata', () => {
    const [variant, plain] = runOnConfig([
      {
        trackId: 'a-vcf',
        type: 'VariantTrack',
        metadata: { ucsc: { defaultLabelFields: 'name' } },
      },
      { trackId: 'a-x', type: 'FeatureTrack' },
    ])
    assert.equal(variant.displays, undefined)
    assert.equal(plain?.displays, undefined)
  })
})

describe('enhanceConfig wiggle display derivation', () => {
  it('derives a display for a QuantitativeTrack from metadata.ucsc', () => {
    const [t] = runOnConfig([
      {
        trackId: 'a-gc5Base',
        type: 'QuantitativeTrack',
        metadata: { ucsc: { windowingFunction: 'Mean', viewLimits: '30:70' } },
      },
    ])
    assert.deepEqual(t.displays, [
      {
        type: 'LinearWiggleDisplay',
        displayId: 'a-gc5Base-LinearWiggleDisplay',
        encoding: {
          y: { field: 'score', scale: { domainMin: 30, domainMax: 70 } },
        },
      },
    ])
  })

  it('refreshes its own entry and keeps the keys it does not own', () => {
    const [t] = runOnConfig([
      {
        trackId: 'a-phyloP',
        type: 'QuantitativeTrack',
        displays: [
          {
            type: 'LinearWiggleDisplay',
            displayId: 'a-phyloP-LinearWiggleDisplay',
            encoding: {
              y: { field: 'score', scale: { domainMin: 0, domainMax: 1 } },
            },
            height: 80,
          },
        ],
        metadata: { ucsc: { viewLimits: '-4.5:8.8' } },
      },
    ])
    assert.deepEqual(t.displays, [
      {
        type: 'LinearWiggleDisplay',
        displayId: 'a-phyloP-LinearWiggleDisplay',
        height: 80,
        encoding: { y: { scale: { domainMin: -4.5, domainMax: 8.8 } } },
      },
    ])
  })

  it('keeps the color channel and the axis beside the members it re-derives', () => {
    const [t] = runOnConfig([
      {
        trackId: 'a-gc5Base',
        type: 'QuantitativeTrack',
        displays: [
          {
            type: 'LinearWiggleDisplay',
            displayId: 'a-gc5Base-LinearWiggleDisplay',
            encoding: {
              color: { value: 'darkgreen' },
              y: {
                field: 'maxScore',
                scale: { domainMin: 0, domainMax: 1 },
                axis: { title: 'GC %' },
              },
            },
          },
        ],
        metadata: { ucsc: { viewLimits: '30:70' } },
      },
    ])
    assert.deepEqual(t.displays[0].encoding, {
      color: { value: 'darkgreen' },
      y: { axis: { title: 'GC %' }, scale: { domainMin: 30, domainMax: 70 } },
    })
  })
})

describe('enhanceConfig label display for NCBI GFF tracks', () => {
  it('writes it on the production pass, with no env var', () => {
    const tracks = runOnConfig([
      {
        trackId: 'hg38-ncbiRefSeqGff',
        type: 'FeatureTrack',
        adapter: {
          type: 'Gff3TabixAdapter',
          gffGzLocation: { uri: 'hg38.gff.gz' },
        },
      },
      {
        trackId: 'GCF_028858775.2-ncbiGff',
        type: 'FeatureTrack',
        adapter: {
          type: 'Gff3TabixAdapter',
          gffGzLocation: { uri: 'x.gff.gz' },
        },
        displays: [],
      },
    ])
    assert.equal(tracks.length, 2)
    for (const t of tracks) {
      assert.equal(t.displays.length, 1)
      assert.equal(t.displays[0].type, 'LinearBasicDisplay')
      assert.equal(t.displays[0].displayId, `${t.trackId}-LinearBasicDisplay`)
      assert.equal(t.displays[0].showOnlyGenes, undefined)
      // the label chain rides along; ncbiGff.test.ts is where its shape is
      // pinned, so this only asserts the production pass writes one
      assert.match(t.displays[0].labels.name, /^jexl:/)
    }
  })

  // UCSC's genePred-derived bigBed of the same annotation draws gene models
  // only, so a type gate would have nothing to hide and everything to lose.
  it('leaves the bigBed of the same annotation alone', () => {
    const [t] = runOnConfig([
      {
        trackId: 'GCF_028858775.2-ncbiRefSeq',
        type: 'FeatureTrack',
        adapter: { type: 'BigBedAdapter', bigBedLocation: { uri: 'x.bb' } },
      },
    ])
    assert.equal(t.displays, undefined)
  })
})

describe('enhanceConfig itemRgb color key', () => {
  const ucsc = {
    itemRgb: 'on',
    mouseOver: '$ref>$alt',
    'filterValues.itemRgb': '255,,0,,0|Protein-altering,0,,128,,0|Synonymous',
  }

  it('puts the key in displayDefaults, so every display gets it', () => {
    const [t] = runOnConfig([
      { trackId: 'a-evaSnp8', type: 'FeatureTrack', metadata: { ucsc } },
    ])
    assert.deepEqual(Object.keys(t.displays[0]), [
      'type',
      'displayId',
      'tooltip',
    ])
    assert.deepEqual(t.displayDefaults, {
      encoding: {
        color: {
          scale: {
            type: 'identity',
            domain: ['rgb(255,0,0)', 'rgb(0,128,0)'],
            names: ['Protein-altering', 'Synonymous'],
          },
        },
      },
    })
  })

  it('writes no display entry when nothing else derives one', () => {
    const { mouseOver: _, ...keyOnly } = ucsc
    const [t] = runOnConfig([
      {
        trackId: 'a-evaSnp8',
        type: 'FeatureTrack',
        metadata: { ucsc: keyOnly },
      },
    ])
    assert.equal(t.displays, undefined)
    assert.deepEqual(Object.keys(t.displayDefaults), ['encoding'])
  })

  it('puts the default filter beside the key', () => {
    const [t] = runOnConfig([
      {
        trackId: 'a-jaspar',
        type: 'FeatureTrack',
        metadata: {
          ucsc: {
            ...ucsc,
            'filter.score': '400',
            'filterByRange.score': '0:1000',
          },
        },
      },
    ])
    assert.deepEqual(Object.keys(t.displayDefaults), ['encoding', 'filter'])
    assert.deepEqual(t.displayDefaults.filter, [{ field: 'score', gte: 400 }])
  })

  it('moves what an earlier run wrote on the basic display', () => {
    const [t] = runOnConfig([
      {
        trackId: 'a-evaSnp8',
        type: 'FeatureTrack',
        displays: [
          {
            type: 'LinearBasicDisplay',
            displayId: 'a-evaSnp8-LinearBasicDisplay',
            encoding: { color: { scale: { type: 'identity' } } },
            filter: [{ field: 'score', gte: 1 }],
          },
        ],
        metadata: { ucsc },
      },
    ])
    assert.deepEqual(Object.keys(t.displays[0]), [
      'type',
      'displayId',
      'tooltip',
    ])
    assert.equal(t.displayDefaults.encoding.color.scale.type, 'identity')
    assert.equal('filter' in t.displayDefaults, false)
  })

  it('leaves a track whose displays were written by hand alone', () => {
    const displays = [
      { type: 'LinearMultiRowFeatureDisplay', rows: { field: 'source' } },
    ]
    const [t] = runOnConfig([
      { trackId: 'a-x', type: 'FeatureTrack', displays, metadata: { ucsc } },
    ])
    assert.deepEqual(t.displays, displays)
    assert.equal('displayDefaults' in t, false)
  })

  it('is unchanged by a second pass', () => {
    const once = runOnConfig([
      { trackId: 'a-evaSnp8', type: 'FeatureTrack', metadata: { ucsc } },
    ])
    assert.equal(JSON.stringify(runOnConfig(once)), JSON.stringify(once))
  })

  it('paints a measured track by its color field', () => {
    const track = {
      trackId: 'hg38-strchive',
      type: 'FeatureTrack',
      metadata: { ucsc: { track: 'strchive', itemRgb: 'on' } },
    }
    const once = runOnConfig([track])
    assert.equal(once[0].displayDefaults.encoding.color.field, 'evidence')
    assert.equal(once[0].displayDefaults.encoding.color.scale.type, 'ordinal')
    assert.equal(once[0].displayDefaults.color, undefined)
    assert.equal(JSON.stringify(runOnConfig(once)), JSON.stringify(once))
  })
})

describe('enhanceConfig repeat-class display', () => {
  it('adds the by-class display to a UCSC rmsk track', () => {
    const [t] = runOnConfig([
      {
        trackId: 'hg38-rmsk',
        type: 'FeatureTrack',
        adapter: {
          type: 'BedTabixAdapter',
          bedGzLocation: { uri: 'rmsk.bed.gz' },
        },
      },
    ])
    assert.deepEqual(
      t.displays.map((d: { type: string }) => d.type),
      ['LinearBasicDisplay', 'LinearMultiRowFeatureDisplay'],
    )
  })

  // Shaped like the GenArk configs shipped: trackId `<acc>-repeatMasker`, a
  // BigBedAdapter, and no `displays` key, which addRepeatClassDisplay reads to
  // hold the default position with a bare LinearBasicDisplay. A bigRmskBed has
  // no class column, so the class comes off the name.
  it('derives the class from the name for a GenArk repeatMasker track', () => {
    const [t] = runOnConfig([
      {
        trackId: 'GCF_000001215.4-repeatMasker',
        type: 'FeatureTrack',
        adapter: {
          type: 'BigBedAdapter',
          uri: 'https://hgdownload.soe.ucsc.edu/hubs/GCF/000/001/215/GCF_000001215.4/bbi/x.rmsk.bb',
        },
      },
    ])
    assert.deepEqual(
      t.displays.map((d: { type: string }) => d.type),
      ['LinearBasicDisplay', 'LinearMultiRowFeatureDisplay'],
    )
    assert.equal(
      t.displays[1]?.rows.field,
      "jexl:split(split(feature.name,'#')[1],'/')[0]",
    )
  })
})

describe('enhanceConfig plugins', () => {
  it('rewrites the url of a plugin the config already names', () => {
    const plugins = runOnPlugins(
      { tracks: [], plugins: [{ name: 'Protein3d', url: 'old' }] },
      [{ name: 'Protein3d', url: 'new' }],
    )
    assert.deepEqual(plugins, [{ name: 'Protein3d', url: 'new' }])
  })

  it('appends a plugin the config does not name', () => {
    const plugins = runOnPlugins(
      { tracks: [], plugins: [{ name: 'Hubs', url: 'hubs' }] },
      [{ name: 'Protein3d', url: 'p3d' }],
    )
    assert.deepEqual(plugins, [
      { name: 'Hubs', url: 'hubs' },
      { name: 'Protein3d', url: 'p3d' },
    ])
  })

  // enhanceConfigs.sh re-runs over already-enhanced configs, so almost every
  // entry this loop sees is one it wrote before storePlugin existed. Assigning
  // `existing.url` alone — which is what it used to do — would have left the
  // whole installed base without a ref no matter how many times it re-ran.
  it('adds a field the existing entry predates', () => {
    const plugins = runOnPlugins(
      { tracks: [], plugins: [{ name: 'MsaView', url: 'old' }] },
      [{ name: 'MsaView', url: 'new', storePlugin: 'MsaView' }],
    )
    assert.deepEqual(plugins, [
      { name: 'MsaView', url: 'new', storePlugin: 'MsaView' },
    ])
  })

  // and the other direction: a field the new entry drops must not survive on
  // the old one, or a config keeps a ref after the pipeline stops emitting it
  it('drops a field the replacement does not name', () => {
    const plugins = runOnPlugins(
      {
        tracks: [],
        plugins: [{ name: 'MsaView', url: 'old', storePlugin: 'MsaView' }],
      },
      [{ name: 'MsaView', storePlugin: 'MsaView' }],
    )
    assert.deepEqual(plugins, [{ name: 'MsaView', storePlugin: 'MsaView' }])
  })

  // v4.3.0 ignores storePlugin, and one entry it cannot load fails the config
  it('gives every default plugin a url a host without store refs can load', () => {
    const { plugins } = enhanceConfigObject({ tracks: [] })
    for (const plugin of plugins ?? []) {
      assert.match(String(plugin.url), /^https:\/\//, plugin.name)
    }
  })

  // v4.3.0 has no MafTrack without it; a v5 host drops the entry itself
  it('names MafViewer, which v4.3.0 does not bundle', () => {
    const { plugins } = enhanceConfigObject({ tracks: [] })
    assert.ok(plugins?.some(p => p.name === 'MafViewer'))
  })
})
