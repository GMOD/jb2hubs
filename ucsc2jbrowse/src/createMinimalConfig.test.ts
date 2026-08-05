import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { minimalTracks, shouldIncludeTrack } from './createMinimalConfig.ts'

import type { JBrowseConfig } from './types'

// minimal.json is what @cmdcolin/jbrowse-plugin-hubs fetches to resolve a genome
// a synteny track references, so what this predicate lets through is both the
// size of that fetch and what the mate panel opens with.
describe('shouldIncludeTrack', () => {
  it('keeps the track groups minimal configs are for', () => {
    for (const id of [
      'hg38-ncbiRefSeq',
      'hg38-ncbiRefSeqCurated',
      'hg38-ncbiRefSeqSelect',
      'hg38-gencodeComp',
      'hg38-gencodeBasic',
      'hg38-rmsk',
      'hg38-rmskJoinedCurrent',
      'hg38-gap',
      'hg38-gapOverlap',
      'hg38-allGaps',
      'hg38-clinvarMain',
      'hg38-clinvarCnv',
      'mm10-clinvarLift',
      'hs1-clinVar20220313',
    ]) {
      assert.equal(shouldIncludeTrack(id), true, id)
    }
  })

  // The regression this predicate exists in its current form for: as a bare
  // substring match, `gencode` matched `wgencode`, so every ENCODE regulation
  // track landed in the minimal configs. On hg38 that was 11 of 33 tracks and
  // 82% of the bytes.
  it('does not mistake wgEncode for gencode', () => {
    for (const id of [
      'hg38-wgEncodeReg4Dnase',
      'hg38-wgEncodeRegTxn',
      'hg38-wgEncodeRegMarkH3k27ac',
      'hg38-wgEncodeReg4MarkCtcf',
      'hg38-wgEncodeRegDnaseWig',
    ]) {
      assert.equal(shouldIncludeTrack(id), false, id)
    }
  })

  it('does not match a pattern buried inside another word', () => {
    for (const id of [
      'hg38-vegaPseudoGene', // ...ve[gap]seudogene
      'hg19-cgapSage', // c[gap]sage
      'hg38-nmdEscGencode', // nmdesc[gencode]
      'hg38-nmdEscNcbiRefSeq',
      'hg19-dbSnp155ClinVar', // dbsnp155[clinvar]
    ]) {
      assert.equal(shouldIncludeTrack(id), false, id)
    }
  })

  it('matches an unprefixed trackId too', () => {
    assert.equal(shouldIncludeTrack('gencodeComp'), true)
    assert.equal(shouldIncludeTrack('wgEncodeRegTxn'), false)
  })
})

function config(trackIds: string[], sessionTrackId?: string): JBrowseConfig {
  return {
    assemblies: [{ name: 'db' }],
    tracks: trackIds.map(trackId => ({
      trackId,
      name: trackId,
      assemblyNames: ['db'],
      category: ['Genes'],
      adapter: {},
    })),
    defaultSession: {
      name: 'db',
      views: [
        {
          id: 'main',
          type: 'LinearGenomeView',
          init: {
            loc: 'chr1',
            assembly: 'db',
            tracks: sessionTrackId ? [sessionTrackId] : [],
          },
        },
      ],
      widgets: {
        hierarchicalTrackSelector: {
          id: 'hierarchicalTrackSelector',
          type: 'HierarchicalTrackSelectorWidget',
          view: 'main',
        },
      },
      activeWidgets: {
        hierarchicalTrackSelector: 'hierarchicalTrackSelector',
      },
    },
  }
}

describe('minimalTracks', () => {
  // A minimal config that drops the track its own defaultSession opens boots to
  // an empty view. Pre-ncbiRefSeq assemblies open refGene/ensGene/augustusGene/
  // xenoRefGene, none of which the patterns match, and that was 134 of 238.
  it('keeps the track the defaultSession opens', () => {
    const tracks = minimalTracks(
      config(['hg18-refGene', 'hg18-knownGene'], 'hg18-refGene'),
    )
    assert.deepEqual(
      tracks.map(t => t.trackId),
      ['hg18-refGene'],
    )
  })

  it('does not keep a gene track the session did not name', () => {
    const tracks = minimalTracks(
      config(['danRer4-ensGene', 'danRer4-xenoRefGene'], 'danRer4-ensGene'),
    )
    assert.deepEqual(
      tracks.map(t => t.trackId),
      ['danRer4-ensGene'],
    )
  })

  it('still applies the patterns when the session names nothing', () => {
    const tracks = minimalTracks(
      config(['hg38-ncbiRefSeq', 'hg38-cpgIslandExt']),
    )
    assert.deepEqual(
      tracks.map(t => t.trackId),
      ['hg38-ncbiRefSeq'],
    )
  })

  it('drops the category, which the full config keeps', () => {
    const [track] = minimalTracks(config(['hg38-ncbiRefSeq']))
    assert.equal(track && 'category' in track, false)
  })

  // hubtools' makeDefaultSession -- what generateJBrowseConfigForAssemblyHub
  // and generateJBrowseConfigsForMultiGenomeHub write -- emits an init with no
  // `tracks` key, and generateDefaultSessions.ts only rewrites the sessions of
  // assemblies named in list.json. Iterating view.init.tracks unguarded threw
  // TypeError, and processAssemblyDirs catches per assembly, so the whole
  // symptom was one "Error processing <db>" line and no minimal.json.
  it('handles a session whose init has no tracks key at all', () => {
    const c = config(['hg38-ncbiRefSeq', 'hg38-cpgIslandExt'])
    delete c.defaultSession!.views[0]!.init.tracks
    assert.deepEqual(
      minimalTracks(c).map(t => t.trackId),
      ['hg38-ncbiRefSeq'],
    )
  })
})
