import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { enhanceConfig } from './enhanceConfig.ts'

import type { JBrowsePlugin } from './types.ts'

function runOnConfig(tracks: unknown[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enhance-'))
  const file = path.join(dir, 'config.json')
  fs.writeFileSync(file, JSON.stringify({ tracks }))
  enhanceConfig(file, [])
  return JSON.parse(fs.readFileSync(file, 'utf8')).tracks
}

function runOnPlugins(config: unknown, plugins: JBrowsePlugin[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enhance-'))
  const file = path.join(dir, 'config.json')
  fs.writeFileSync(file, JSON.stringify(config))
  enhanceConfig(file, plugins)
  return JSON.parse(fs.readFileSync(file, 'utf8')).plugins
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
    assert.deepEqual(t.displays[0].jexlFilters, [
      "get(feature,'gbkey')!='Src'",
      "get(feature,'score') >= 400",
    ])
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
            jexlFilters: ["get(feature,'score') >= 400"],
          },
        ],
        metadata: { ucsc: { defaultLabelFields: 'new' } },
      },
    ])
    assert.equal(t.displays[0].labels.name, "jexl:get(feature,'new')")
    assert.equal('jexlFilters' in t.displays[0], false)
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

  it('sets no formatDetails on a track with no detailsTabUrls', () => {
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
    assert.equal(plain.displays, undefined)
  })
})

describe('enhanceConfig gene-only display for NCBI GFF tracks', () => {
  // Ungated, unlike the repeat-class display below: an undeclared config slot on
  // a display type every supported host has is dropped in silence, where an
  // unreleased display TYPE is a fatal union error. So this one has to reach the
  // production pass, and the assertion protecting the shipped file is that it
  // does — with no env var set.
  it('writes it on the production pass, with no env var', () => {
    const [ucsc, genark] = runOnConfig([
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
    for (const t of [ucsc, genark]) {
      assert.deepEqual(t.displays, [
        {
          type: 'LinearBasicDisplay',
          displayId: `${t.trackId}-LinearBasicDisplay`,
          showOnlyGenes: true,
        },
      ])
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

describe('enhanceConfig repeat-class display gate', () => {
  const rmsk = {
    trackId: 'hg38-rmsk',
    type: 'FeatureTrack',
    adapter: { type: 'BedTabixAdapter', bedGzLocation: { uri: 'rmsk.bed.gz' } },
  }
  function withEnv<T>(value: string | undefined, fn: () => T) {
    const before = process.env.RMSK_MULTIROW_DISPLAY
    if (value === undefined) {
      delete process.env.RMSK_MULTIROW_DISPLAY
    } else {
      process.env.RMSK_MULTIROW_DISPLAY = value
    }
    try {
      return fn()
    } finally {
      if (before === undefined) {
        delete process.env.RMSK_MULTIROW_DISPLAY
      } else {
        process.env.RMSK_MULTIROW_DISPLAY = before
      }
    }
  }

  // The gate is the whole point: an unreleased display type in `displays[]` is a
  // fatal MST union error on every host that lacks it, so the production pass
  // must not write one. See the comment in enhanceConfig.ts.
  it('writes no display without the env var', () => {
    const [t] = withEnv(undefined, () => runOnConfig([rmsk]))
    assert.equal(t.displays, undefined)
  })

  it('writes the by-class display with it', () => {
    const [t] = withEnv('1', () => runOnConfig([rmsk]))
    assert.deepEqual(
      t.displays.map((d: { type: string }) => d.type),
      ['LinearBasicDisplay', 'LinearMultiRowFeatureDisplay'],
    )
  })

  // The GenArk half of the gate, which the two cases above do not reach: they
  // use the UCSC shape (a `-rmsk` BedTabixAdapter with a real `repClass`
  // column), and the branch that matters for GenArk is the other one. Shaped
  // like the configs actually shipped — trackId `<acc>-repeatMasker`, a
  // BigBedAdapter, and NO `displays` key at all, checked against
  // hubs/GCF/000/001/215/GCF_000001215.4/config.json and 32 of its siblings.
  //
  // That absent key is load-bearing twice over. `addRepeatClassDisplay` reads
  // it to decide whether to hold the default position with an explicit bare
  // LinearBasicDisplay, so a config whose repeatMasker track declared `[]`
  // instead would get the painting as its DEFAULT view. And it is what the
  // production assertion below is really about.
  const genark = {
    trackId: 'GCF_000001215.4-repeatMasker',
    type: 'FeatureTrack',
    adapter: {
      type: 'BigBedAdapter',
      uri: 'https://hgdownload.soe.ucsc.edu/hubs/GCF/000/001/215/GCF_000001215.4/bbi/x.rmsk.bb',
    },
  }

  // The one that guards a shipped file. GenArk hubs are NOT staged — their
  // config.json is what production serves and what old hosts read — and an
  // unreleased display type there is a fatal MST union error the moment someone
  // opens the track. Nothing else pins that the production pass leaves a GenArk
  // repeatMasker track alone; the equivalent above only says it for UCSC.
  it('leaves a GenArk repeatMasker track alone without the env var', () => {
    const [t] = withEnv(undefined, () => runOnConfig([genark]))
    assert.equal(t.displays, undefined)
  })

  it('derives the class from the name for GenArk with it', () => {
    const [t] = withEnv('1', () => runOnConfig([genark]))
    assert.deepEqual(
      t.displays.map((d: { type: string }) => d.type),
      ['LinearBasicDisplay', 'LinearMultiRowFeatureDisplay'],
    )
    // the jexl form, not `repClass`: a bigRmskBed has no class column
    assert.equal(
      t.displays[1].partitionField,
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
        plugins: [{ name: 'MafViewer', url: 'old', storePlugin: 'Gone' }],
      },
      [{ name: 'MafViewer', url: 'new' }],
    )
    assert.deepEqual(plugins, [{ name: 'MafViewer', url: 'new' }])
  })
})
