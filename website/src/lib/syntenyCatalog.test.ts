import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  createStaticCatalog,
  isSelfPair,
  pickDefaultTrack,
  trackIsLaunchable,
} from './syntenyCatalog.ts'

import type {
  AssemblyInfo,
  AssemblySource,
  SyntenyCatalogData,
  SyntenyTrackSummary,
} from './syntenyCatalog.ts'

// The /synteny page feeds this exact JSON straight into createStaticCatalog, so
// guarding the real blob's shape here catches data-contract drift (the failure
// mode that broke the build) without needing to render the React component.
const dataUrl = new URL('../syntenyTracks.json', import.meta.url)
const data = JSON.parse(
  readFileSync(fileURLToPath(dataUrl), 'utf8'),
) as SyntenyCatalogData

const allSources = true
const filter = { ucsc: allSources, genark: allSources }

describe('syntenyTracks.json contract', () => {
  it('has the top-level shape createStaticCatalog destructures', () => {
    assert.ok(Array.isArray(data.tracks), 'tracks must be an array')
    assert.ok(data.assemblyInfo, 'assemblyInfo must be present')
  })

  it('only uses known assembly sources', () => {
    const known = new Set<AssemblySource>(['ucsc', 'genark', 'legacy'])
    for (const [id, info] of Object.entries(data.assemblyInfo)) {
      assert.ok(
        known.has(info.source),
        `assembly ${id} has unknown source ${info.source}`,
      )
    }
  })

  it('gives every track a trackId, name, and assemblyNames', () => {
    for (const track of data.tracks) {
      assert.ok(track.trackId, 'track missing trackId')
      assert.ok(track.name, `track ${track.trackId} missing name`)
      assert.ok(
        Array.isArray(track.assemblyNames),
        `track ${track.trackId} missing assemblyNames`,
      )
    }
  })
})

describe('pickDefaultTrack', () => {
  const track = (trackId: string): SyntenyTrackSummary => ({
    trackId,
    name: trackId,
    assemblyNames: trackId.replace(/_liftOver.*/, '').split('_to_'),
  })

  it('picks the track whose target is species1 (forward direction)', () => {
    const tracks = [
      track('hg38_to_GCA_000152225.2_liftOver'),
      track('GCA_000152225.2_to_hg38_liftOver'),
    ]
    assert.equal(
      pickDefaultTrack(tracks, 'GCA_000152225.2')!.trackId,
      'GCA_000152225.2_to_hg38_liftOver',
    )
    assert.equal(
      pickDefaultTrack(tracks, 'hg38')!.trackId,
      'hg38_to_GCA_000152225.2_liftOver',
    )
  })

  it('prefers plain liftOver over a chainBridge variant in the same direction', () => {
    const tracks = [
      track('hg19_to_hg38_liftOver_chainBridge'),
      track('hg19_to_hg38_liftOver'),
      track('hg38_to_hg19_liftOver'),
    ]
    assert.equal(
      pickDefaultTrack(tracks, 'hg19')!.trackId,
      'hg19_to_hg38_liftOver',
    )
  })

  it('falls back to the first track when no forward direction exists', () => {
    const tracks = [track('hg38_to_hg19_liftOver')]
    assert.equal(
      pickDefaultTrack(tracks, 'hg19')!.trackId,
      'hg38_to_hg19_liftOver',
    )
  })
})

describe('createStaticCatalog over the real blob', () => {
  const catalog = createStaticCatalog(data)

  it('lists launchable assemblies', () => {
    const assemblies = catalog.listAssemblies(filter)
    assert.ok(
      assemblies.length > 0,
      'expected at least one launchable assembly',
    )
  })

  it('finds partners and shared tracks for a launchable pair', () => {
    const assemblies = catalog.listAssemblies(filter)
    const first = assemblies[0]!
    const partners = catalog.listPartners(first.id, filter)
    assert.ok(partners.length > 0, `expected partners for ${first.id}`)
    const tracks = catalog.listTracks(first.id, partners[0]!.id, filter)
    assert.ok(
      tracks.length > 0,
      `expected shared tracks for ${first.id} / ${partners[0]!.id}`,
    )
  })
})

// The pruned island shape: only assemblies a track names, each carrying the
// gene track its panel opens, and a taxon for every UCSC assembly the genome
// list knows — hs1 in particular, whose config knows no organism at all.
describe('syntenyTracks.json is the pruned selector shape', () => {
  it('holds info only for assemblies a track names', () => {
    const named = new Set(data.tracks.flatMap(t => t.assemblyNames))
    for (const id of Object.keys(data.assemblyInfo)) {
      assert.ok(named.has(id), `${id} takes part in no track`)
    }
    for (const id of named) {
      assert.ok(data.assemblyInfo[id], `${id} has no assembly info`)
    }
  })

  it('carries a gene track string for every assembly', () => {
    for (const [id, info] of Object.entries(data.assemblyInfo)) {
      assert.equal(typeof info.geneTrack, 'string', `${id} lacks geneTrack`)
    }
    assert.equal(data.assemblyInfo.hg38?.geneTrack, 'hg38-ncbiRefSeqGff')
    assert.equal(
      data.assemblyInfo['GCF_000001215.4']?.geneTrack,
      'GCF_000001215.4-ncbiRefSeq',
    )
  })

  it('gives the human and mouse pairs a taxon, so the gene box appears', () => {
    for (const id of ['hg38', 'hg19', 'hs1', 'mm39', 'mm10']) {
      assert.equal(
        data.assemblyInfo[id]?.taxonId,
        id.startsWith('h') ? 9606 : 10090,
      )
    }
    assert.equal(data.assemblyInfo.hs1?.commonName, 'Human')
  })
})

describe('trackIsLaunchable', () => {
  const info: Record<string, AssemblyInfo> = {
    hg38: { source: 'ucsc', geneTrack: '' },
    'GCF_000001635.27': { source: 'genark', geneTrack: '' },
    hg17: { source: 'legacy', geneTrack: '' },
  }
  const track = (...assemblyNames: string[]): SyntenyTrackSummary => ({
    trackId: assemblyNames.join('_to_'),
    name: '',
    assemblyNames,
  })

  it('needs both ends hosted and not retired', () => {
    assert.ok(trackIsLaunchable(track('hg38', 'GCF_000001635.27'), info))
    assert.ok(!trackIsLaunchable(track('hg38', 'hg17'), info))
    assert.ok(!trackIsLaunchable(track('hg38', 'unknown'), info))
  })

  it('honours the source filter on either end', () => {
    const t = track('hg38', 'GCF_000001635.27')
    assert.ok(!trackIsLaunchable(t, info, { ucsc: false, genark: true }))
    assert.ok(!trackIsLaunchable(t, info, { ucsc: true, genark: false }))
  })
})

describe('isSelfPair', () => {
  const info: Record<string, AssemblyInfo> = {
    dm6: { source: 'ucsc', accession: 'GCA_000001215.4', geneTrack: '' },
    'GCF_000001215.4': { source: 'genark', geneTrack: '' },
    hg19: { source: 'ucsc', accession: 'GCA_000001405.1', geneTrack: '' },
    hg38: { source: 'ucsc', accession: 'GCA_000001405.15', geneTrack: '' },
    'GCF_000001735.3': { source: 'genark', geneTrack: '' },
    'GCF_000001735.4_TAIR10.1': { source: 'genark', geneTrack: '' },
  }
  const track = (a: string, b: string): SyntenyTrackSummary => ({
    trackId: `${a}_to_${b}_liftOver`,
    name: '',
    assemblyNames: [a, b],
  })

  it('is the same assembly under its UCSC and GenArk names', () => {
    assert.ok(isSelfPair(track('dm6', 'GCF_000001215.4'), info))
  })

  it('keeps two versions of one genome as a real comparison', () => {
    assert.ok(!isSelfPair(track('hg19', 'hg38'), info))
    assert.ok(
      !isSelfPair(track('GCF_000001735.3', 'GCF_000001735.4_TAIR10.1'), info),
    )
  })
})

describe('createStaticCatalog over the pruned blob', () => {
  const catalog = createStaticCatalog(data)

  it('does not offer an assembly as its own partner', () => {
    const partners = catalog.listPartners('dm6', filter).map(a => a.id)
    assert.ok(partners.length > 0)
    assert.ok(!partners.includes('GCF_000001215.4'))
    assert.ok(catalog.listPartners('hg19', filter).some(a => a.id === 'hg38'))
  })

  it('counts a comparison once whichever direction or variant it comes in', () => {
    const one = createStaticCatalog({
      tracks: [
        { trackId: 'a_to_b_liftOver', name: '', assemblyNames: ['a', 'b'] },
        { trackId: 'b_to_a_liftOver', name: '', assemblyNames: ['b', 'a'] },
        {
          trackId: 'a_to_b_liftOver_chainBridge',
          name: '',
          assemblyNames: ['a', 'b'],
        },
        { trackId: 'a_to_c_liftOver', name: '', assemblyNames: ['a', 'c'] },
      ],
      assemblyInfo: {
        a: { source: 'ucsc', geneTrack: '' },
        b: { source: 'ucsc', geneTrack: '' },
        c: { source: 'legacy', geneTrack: '' },
      },
    })
    assert.equal(one.countComparisons(filter), 1)
    assert.ok(catalog.countComparisons(filter) < data.tracks.length)
  })
})
