import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { buildBigMafTrack } from './buildBigMafTrack.ts'

const baseUrl = 'https://hgdownload.soe.ucsc.edu'

// Real hg38 trackDb settings, verbatim. multiz470way spells its sidecars as
// full urls and cactus241way spells its summary as a bare /gbdb path, in the
// same trackDb — which is the whole reason resolution is not a string concat.
//
// Without CHECK_404 (make.sh sets it; its path needs the network)
// checkIfFileAccessible is the identity, so these exercise resolution only.
const multiz470way = {
  longLabel: '470 mammals alignment',
  speciesLabels:
    'HLnomLeu4="northern white-cheeked gibbon" HLmacFas6="crab-eating macaque"',
  summary: `${baseUrl}/goldenPath/hg38/multiz470way/multiz470waySummary.bb`,
  frames: `${baseUrl}/goldenPath/hg38/multiz470way/multiz470wayFrames.bb`,
}
const cactus241way = {
  longLabel: 'Cactus 241-way',
  speciesLabels: 'Acinonyx_jubatus="cheetah"',
  summary: '/gbdb/hg38/cactus241way/tinySummary.bb',
  frames: `${baseUrl}/goldenPath/hg38/cactus241way/cactus241wayFrames.bb`,
}

function build(settings: Record<string, string>) {
  return buildBigMafTrack({
    trackId: 'hg38-multiz470way',
    tableName: 'multiz470way',
    assemblyName: 'hg38',
    uri: `${baseUrl}/goldenPath/hg38/multiz470way/multiz470way.bigMaf`,
    baseUrl,
    settings,
  })
}

describe('buildBigMafTrack', () => {
  it('wires the summary and frames sidecars trackDb names', async () => {
    const { adapter } = await build(multiz470way)
    assert.deepEqual(adapter.summaryAdapter, {
      type: 'BigBedAdapter',
      bigBedLocation: {
        uri: `${baseUrl}/goldenPath/hg38/multiz470way/multiz470waySummary.bb`,
      },
    })
    assert.deepEqual(adapter.annotationAdapter, {
      type: 'BigBedAdapter',
      bigBedLocation: {
        uri: `${baseUrl}/goldenPath/hg38/multiz470way/multiz470wayFrames.bb`,
      },
    })
  })

  it('resolves a bare hgdownload path, leaving one that names a host alone', async () => {
    const { adapter } = await build(cactus241way)
    assert.deepEqual(adapter.summaryAdapter, {
      type: 'BigBedAdapter',
      bigBedLocation: {
        uri: `${baseUrl}/gbdb/hg38/cactus241way/tinySummary.bb`,
      },
    })
    assert.deepEqual(adapter.annotationAdapter, {
      type: 'BigBedAdapter',
      bigBedLocation: {
        uri: `${baseUrl}/goldenPath/hg38/cactus241way/cactus241wayFrames.bb`,
      },
    })
  })

  it('omits a slot the trackDb has no setting for, rather than nulling it', async () => {
    const { adapter } = await build({ longLabel: 'no sidecars' })
    assert.equal('summaryAdapter' in adapter, false)
    assert.equal('annotationAdapter' in adapter, false)
  })

  it('keeps the shape the rest of the pipeline expects', async () => {
    const track = await build(multiz470way)
    assert.equal(track.type, 'MafTrack')
    assert.equal(track.adapter.type, 'BigMafAdapter')
    assert.deepEqual(track.assemblyNames, ['hg38'])
    assert.deepEqual(track.adapter.bigBedLocation, {
      uri: `${baseUrl}/goldenPath/hg38/multiz470way/multiz470way.bigMaf`,
    })
    assert.deepEqual(track.adapter.samples, [
      { id: 'HLnomLeu4', label: 'northern white-cheeked gibbon' },
      { id: 'HLmacFas6', label: 'crab-eating macaque' },
    ])
  })

  it('leaves nhLocation off without CHECK_404, where the lookup cannot run', async () => {
    const { adapter } = await build(multiz470way)
    assert.equal('nhLocation' in adapter, false)
  })
})

// The tree is the one sidecar the trackDb does not name, so it costs a request:
// one autoindex read of the alignment's own directory. hg38 is the only UCSC
// assembly with real bigMaf alignments (hs1's 27 and galGal6's 3 are all
// chainNet, which the lookup skips outright), so a full ucsc2jbrowse build
// spends three of these and an incremental build that leaves hg38 alone spends
// none.
//
// No `summary`/`frames`, deliberately. These cases set CHECK_404, which is also
// what turns checkIfFileAccessible on, and that reads and WRITES the real
// ucsc2jbrowse/fileAccessCache/<db>.json: with sidecars in the settings, the
// 404 case below would record the live multiz470way summary and frames as
// blocked for 90 days, and the run after that would ship hg38 without them.
// They passed only because that committed cache happened to hold fresh
// entries for both -- i.e. they were a test of the cache's age. The tree
// lookup does not depend on the sidecars, so leaving them out makes these
// hermetic.
const treeOnly = {
  longLabel: multiz470way.longLabel,
  speciesLabels: multiz470way.speciesLabels,
}

describe('buildBigMafTrack species tree', () => {
  const realFetch = globalThis.fetch
  let calls: string[] = []

  function stubFetch(reply: (target: string) => Promise<unknown>) {
    calls = []
    globalThis.fetch = ((target: unknown) => {
      calls.push(String(target))
      return reply(String(target))
    }) as unknown as typeof globalThis.fetch
  }

  const autoindex = (names: string[]) => () =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          names.map(name => `<a href="${name}">${name}</a>`).join('\n'),
        ),
    })

  afterEach(() => {
    globalThis.fetch = realFetch
    delete process.env.CHECK_404
  })

  it('wires the tree hgdownload ships beside the alignment', async () => {
    process.env.CHECK_404 = 'true'
    stubFetch(
      autoindex([
        'hg38.470way.commonNames.nh',
        'hg38.470way.nh',
        'hg38.470way.scientificNames.nh',
        'multiz470way.bigMaf',
      ]),
    )
    const { adapter } = await build(treeOnly)
    assert.deepEqual(adapter.nhLocation, {
      uri: `${baseUrl}/goldenPath/hg38/multiz470way/hg38.470way.nh`,
    })
    assert.deepEqual(calls, [`${baseUrl}/goldenPath/hg38/multiz470way/`])
  })

  it('omits nhLocation rather than naming a file upstream does not publish', async () => {
    process.env.CHECK_404 = 'true'
    stubFetch(() => Promise.resolve({ ok: false, status: 404 }))
    const { adapter } = await build(treeOnly)
    assert.equal('nhLocation' in adapter, false)
  })
})
