import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createStaticCatalog, pickDefaultTrack } from './syntenyCatalog.ts'

import type {
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
