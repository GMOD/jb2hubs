import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { withTrackDbMetadata } from './trackDbMetadata.ts'

import type { TrackDbEntry, UcscTrack } from './types.ts'

function entry(
  tableName: string,
  html: string,
  parent?: string,
  shortLabel = tableName,
): TrackDbEntry {
  return {
    tableName,
    settings: [
      `track ${tableName}`,
      `html ${tableName}`,
      ...(parent ? [`parent ${parent}`] : []),
    ].join('\n'),
    html,
    longLabel: `${tableName} long`,
    grp: 'map',
    shortLabel,
    type: 'bigBed 6',
  }
}

const tracksDb = {
  mappability: entry('mappability', '<h2>Description</h2>'),
  umap: entry('umap', '<h2>Description</h2>\n<p>Umap</p>', 'mappability'),
  umap24: entry('umap24', '', 'umap'),
  blank: entry('blank', ' \n'),
  dbSnp155Composite: entry('dbSnp155Composite', ''),
  dbSnp155ViewVariants: entry('dbSnp155ViewVariants', '', 'dbSnp155Composite'),
  dbSnp155Common: entry('dbSnp155Common', '', 'dbSnp155ViewVariants'),
  panelApp: entry('panelApp', ''),
  panelAppGenes: entry('panelAppGenes', '', 'panelApp'),
  uniprot: entry('uniprot', '', undefined, 'UniProt'),
  spAnnot: entry('spAnnot', '', 'uniprot', 'UniProt Annot.'),
  swissProt: entry('swissProt', '', undefined, 'UniProt'),
  spStruct: entry('spStruct', '', 'swissProt', 'UniProt Structure'),
  unipStruct: entry('unipStruct', '', 'uniprot', 'Structure'),
}

function track(table: string): UcscTrack {
  return {
    type: 'FeatureTrack',
    trackId: `hg38-${table}`,
    name: table,
    assemblyNames: ['hg38'],
    adapter: { type: 'BigBedAdapter' },
  }
}

function ucscOf(table: string) {
  return withTrackDbMetadata(track(table), tracksDb).metadata?.ucsc
}

describe('withTrackDbMetadata', () => {
  it('links the description page of a track with trackDb prose, in place of the html setting', () => {
    assert.deepEqual(ucscOf('umap'), {
      track: 'umap',
      parent: 'mappability',
      html: '<a href="https://jbrowse.org/ucsc/hg38/descriptions/umap.html">Track description</a>',
    })
  })

  it('links nothing for a track whose trackDb html is empty or blank', () => {
    assert.deepEqual(ucscOf('umap24'), { track: 'umap24', parent: 'umap' })
    assert.deepEqual(ucscOf('blank'), { track: 'blank' })
  })

  it('names a track after its set and itself, the set once', () => {
    const nameOf = (table: string) =>
      withTrackDbMetadata(track(table), tracksDb).name
    assert.equal(nameOf('umap'), 'mappability - umap')
    assert.equal(nameOf('panelAppGenes'), 'panelApp - panelAppGenes')
    assert.equal(
      nameOf('dbSnp155Common'),
      'dbSnp155ViewVariants - dbSnp155Common',
    )
    assert.equal(nameOf('spAnnot'), 'UniProt - Annot.')
  })

  it('keeps a repeated set when dropping it would name two tracks alike, under one set or two labelled alike', () => {
    const nameOf = (table: string) =>
      withTrackDbMetadata(track(table), tracksDb).name
    assert.equal(nameOf('unipStruct'), 'UniProt - Structure')
    assert.equal(nameOf('spStruct'), 'UniProt - UniProt Structure')
  })

  it('leaves a track with no trackDb entry as it was', () => {
    assert.deepEqual(
      withTrackDbMetadata(track('ours'), tracksDb),
      track('ours'),
    )
  })

  it('marks a track under a variant database as kind Variant, and nothing else', () => {
    const kind = (table: string) =>
      withTrackDbMetadata(track(table), tracksDb).metadata?.kind
    assert.equal(kind('dbSnp155Common'), 'Variant')
    assert.equal(kind('panelAppGenes'), undefined)
    assert.equal(kind('umap24'), undefined)
  })

  it('leaves a signal track under a variant database to its own type', () => {
    const signal = { ...track('dbSnp155Common'), type: 'QuantitativeTrack' }
    assert.equal(
      withTrackDbMetadata(signal, tracksDb).metadata?.kind,
      undefined,
    )
  })

  it('lifts a subtrack subgroups into metadata through its composite definitions', () => {
    const withSettings = (
      tableName: string,
      settings: string[],
    ): TrackDbEntry => ({
      ...entry(tableName, ''),
      settings: [`track ${tableName}`, ...settings].join('\n'),
    })
    const encode = {
      encReg: withSettings('encReg', [
        'compositeTrack on',
        'subGroup1 view Views Signal=Signal Peaks=Peaks',
        'subGroup2 cell Cell_Line K562=K562 HeLa_S3=HeLa-S3',
      ]),
      encRegSignal: withSettings('encRegSignal', [
        'parent encReg',
        'view Signal',
      ]),
      encRegHelaSignal: withSettings('encRegHelaSignal', [
        'parent encRegSignal on',
        'subGroups view=Signal cell=HeLa_S3',
      ]),
    }
    assert.deepEqual(
      withTrackDbMetadata(track('encRegHelaSignal'), encode).metadata,
      {
        Views: 'Signal',
        'Cell Line': 'HeLa-S3',
        ucsc: {
          track: 'encRegHelaSignal',
          parent: 'encRegSignal on',
          subGroups: 'view=Signal cell=HeLa_S3',
        },
      },
    )
    assert.deepEqual(
      withTrackDbMetadata(track('encRegSignal'), encode).metadata,
      { ucsc: { track: 'encRegSignal', parent: 'encReg', view: 'Signal' } },
    )
  })
})
