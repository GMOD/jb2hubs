import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { addMetadata } from './addMetadata.ts'
import { BED_TABIX, tabixTrack } from './addTabixTrackToConfig.ts'
import { keptTables } from './keptTables.ts'

import type { TrackDbEntry } from './types.ts'
import type { FinalizeContext } from './utils/finalizeStep.ts'

function entry(
  tableName: string,
  shortLabel: string,
  parent?: string,
): TrackDbEntry {
  return {
    tableName,
    settings: [`track ${tableName}`, parent ? `parent ${parent} on` : '']
      .filter(Boolean)
      .join('\n'),
    html: '',
    longLabel: shortLabel,
    grp: 'genes',
    shortLabel,
    type: 'bed 12',
  }
}

const hg19: Record<string, TrackDbEntry> = {
  knownGene: entry('knownGene', 'UCSC Genes'),
  encodeGencodeGeneKnownMonth07: entry('encodeGencodeGeneKnownMonth07', 'x'),
  burgeRnaSeqGemMapperAlignBT474: entry(
    'burgeRnaSeqGemMapperAlignBT474',
    'BT474',
    'burgeRnaSeqGemMapperAlignViewAlignments',
  ),
  lincRNAsCTAdipose: entry(
    'lincRNAsCTAdipose',
    'Adipose',
    'lincRNAsAllCellType',
  ),
  lincRNAsTranscripts: entry('lincRNAsTranscripts', 'lincRNA Transcripts'),
}

// hs1's rules match the composed `<parent shortLabel> - <shortLabel>` name.
const hs1: Record<string, TrackDbEntry> = {
  sgdpComposite: entry('sgdpComposite', 'SGDP'),
  sgdpVariants: entry('sgdpVariants', 'Variants', 'sgdpComposite'),
  hgnc: entry('hgnc', 'HGNC'),
}

function addMetadataKeeps(db: string, tracksDb: Record<string, TrackDbEntry>) {
  const ctx = {
    assemblyName: db,
    tracksDb,
    compareOnly: true,
    config: {
      assemblies: [{ name: db }],
      tracks: Object.keys(tracksDb).map(key =>
        tabixTrack(db, `${key}${BED_TABIX.extension}`, BED_TABIX),
      ),
    },
  } as unknown as FinalizeContext
  addMetadata.run(ctx)
  return ctx.config.tracks.map(t => t.trackId.slice(db.length + 1))
}

describe('keptTables', () => {
  it('drops by prefix, parent and track id', () => {
    assert.deepEqual(keptTables('hg19', hg19), ['knownGene'])
  })

  it('drops an hs1 track by the name addMetadata composes', () => {
    assert.deepEqual(keptTables('hs1', hs1), ['hgnc'])
  })

  it('keeps an extension name over the composed one', () => {
    const extension = {
      tracks: [
        {
          trackId: 'hs1-hgnc',
          name: 'CHM13 genes',
          assemblyNames: ['hs1'],
          adapter: {},
        },
      ],
    }
    assert.deepEqual(keptTables('hs1', hs1, extension), [])
  })

  it('keeps what addMetadata keeps', () => {
    for (const [db, tracksDb] of [
      ['hg19', hg19],
      ['hs1', hs1],
    ] as const) {
      assert.deepEqual(keptTables(db, tracksDb), addMetadataKeeps(db, tracksDb))
    }
  })
})
