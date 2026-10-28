import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

import { generateJBrowseConfigsForMultiGenomeHub } from './generateJBrowseConfigsForMultiGenomeHub.ts'

const HUB_URL = 'https://hgdownload.soe.ucsc.edu/hubs/mouseStrains/hub.txt'

type Config = Awaited<
  ReturnType<typeof generateJBrowseConfigsForMultiGenomeHub>
>[number]

// Integration tests against the live UCSC mouseStrains hub
describe('generateJBrowseConfigsForMultiGenomeHub', { timeout: 60_000 }, () => {
  let configs: Config[]

  before(async () => {
    configs = await generateJBrowseConfigsForMultiGenomeHub(HUB_URL)
  })

  it('returns 16 strain configs (skips hosted mm10 and rn6)', () => {
    assert.equal(configs.length, 16)
    assert.ok(!configs.some(c => c.genomeName === 'mm10'))
    assert.ok(!configs.some(c => c.genomeName === 'rn6'))
  })

  it('each config has a single assembly matching the genome name', () => {
    for (const { genomeName, config } of configs) {
      const assemblies = config.assemblies as { name: string }[]
      assert.equal(assemblies.length, 1)
      assert.equal(assemblies[0]!.name, genomeName)
    }
  })

  it('each config has a MafTrack with BigMafAdapter for cross-strain alignment', () => {
    for (const { genomeName, config } of configs) {
      const tracks = config.tracks as {
        type: string
        adapter: { type: string }
      }[]
      const mafTrack = tracks.find(t => t.type === 'MafTrack')
      assert.ok(mafTrack, `${genomeName} is missing MafTrack`)
      assert.equal(mafTrack.adapter.type, 'BigMafAdapter')
    }
  })

  it('each config has BAM alignment tracks from the RNA-seq include', () => {
    for (const { genomeName, config } of configs) {
      const tracks = config.tracks as { adapter: { type: string } }[]
      const bamTracks = tracks.filter(t => t.adapter.type === 'BamAdapter')
      assert.ok(bamTracks.length > 0, `${genomeName} has no BAM tracks`)
    }
  })

  it('each config has a TwoBitAdapter with an absolute chromSizes URL', () => {
    for (const { genomeName, config } of configs) {
      const assemblies = config.assemblies as {
        sequence: { adapter: { type: string; chromSizes: string } }
      }[]
      const adapter = assemblies[0]!.sequence.adapter
      assert.equal(adapter.type, 'TwoBitAdapter')
      assert.ok(
        adapter.chromSizes.startsWith('https://'),
        `${genomeName} chromSizes is not an absolute URL: ${adapter.chromSizes}`,
      )
    }
  })

  it('each config has a defaultSession with a valid loc', () => {
    for (const { genomeName, config } of configs) {
      const session = config.defaultSession as {
        views: { init: { loc: string } }[]
      }
      assert.ok(session, `${genomeName} is missing defaultSession`)
      const loc = session.views[0]!.init.loc
      assert.match(
        loc,
        /^chr\w+:\d+-\d+$/,
        `${genomeName} has invalid loc: ${loc}`,
      )
    }
  })
})
