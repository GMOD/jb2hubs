import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildChainTracks, parseTargetAssembly } from './buildChainTracks.ts'
import { buildHubConfig } from './buildConfig.ts'

const acc = 'GCF_000001405.40'
const hubFileText = `hub GCF_000001405.40
shortLabel human
longLabel human (GRCh38.p14 2022)
useOneFile on
email x@y.z

genome ${acc}
description human (GRCh38.p14 2022)
twoBitPath ${acc}.2bit
chromSizes ${acc}.chrom.sizes.txt
chromAliasBb ${acc}.chromAlias.bb
defaultPos NC_000001.11:1-1000

track assembly
longLabel Assembly
shortLabel Assembly
bigDataUrl bbi/${acc}.assembly.bb
type bigBed 6
group map
visibility hide
`
const trackDbUrl = `https://hgdownload.soe.ucsc.edu/hubs/GCF/000/001/405/${acc}/hub.txt`
const gffName = `${acc}_GRCh38.p14_genomic.gff.gz`

function build(extra: Partial<Parameters<typeof buildHubConfig>[0]> = {}) {
  return buildHubConfig({
    accession: acc,
    hubFileText,
    trackDbUrl,
    chainTracks: [],
    ...extra,
  })
}

describe('buildHubConfig', () => {
  it('keeps the key order the published configs have', () => {
    const config = build({
      gff: { fileName: gffName, geneticCodes: { 'NC_012920.1': 2 } },
    })
    assert.deepEqual(Object.keys(config), [
      'assemblies',
      'tracks',
      'defaultSession',
      'aggregateTextSearchAdapters',
      'plugins',
      'configuration',
    ])
    assert.deepEqual(Object.keys(config.assemblies![0] as object), [
      'name',
      'displayName',
      'sequence',
      'refNameAliases',
      'geneticCodes',
    ])
  })

  it('adds the NCBI GFF track last, enhanced, with a trix adapter for it', () => {
    const config = build({ gff: { fileName: gffName, geneticCodes: {} } })
    const track = config.tracks!.at(-1)!
    assert.equal(track.trackId, `${acc}-ncbiGff`)
    assert.deepEqual(track.adapter, {
      type: 'Gff3TabixAdapter',
      gffGzLocation: { uri: gffName, locationType: 'UriLocation' },
      index: {
        location: { uri: `${gffName}.csi`, locationType: 'UriLocation' },
        indexType: 'CSI',
      },
    })
    assert.ok(Array.isArray(track.displays))
    assert.ok(track.textSearching)
    assert.equal(
      (
        config.aggregateTextSearchAdapters as { ixFilePath: { uri: string } }[]
      )[0]!.ixFilePath.uri,
      `trix/${acc}.ix`,
    )
    assert.equal('geneticCodes' in (config.assemblies![0] as object), false)
  })

  it('leaves out the GFF track, trix adapter and codes when there is no GFF', () => {
    const config = build()
    assert.equal(
      config.tracks!.some(t => t.trackId.endsWith('-ncbiGff')),
      false,
    )
    assert.equal('aggregateTextSearchAdapters' in config, false)
  })

  it('puts extension tracks first, prefixed, and lets them win on trackId', () => {
    const config = build({
      extension: {
        tracks: [
          { trackId: 'assembly', name: 'override' },
          { trackId: 'extra', name: 'extra' },
        ],
      },
    })
    assert.deepEqual(
      config.tracks!.map(t => t.trackId),
      [`${acc}-assembly`, `${acc}-extra`],
    )
    assert.equal(config.tracks![0]!.name, 'override')
  })

  it('appends chain tracks that are not already present', () => {
    const chain = buildChainTracks({
      sourceAccession: acc,
      sourceCommonName: 'human',
      pifFiles: [`${acc}ToGCF_000001635.27.pif.gz`, 'hg38.mm39.pif.gz'],
      targetCommonName: (t, isGenArk) => (isGenArk ? `genark ${t}` : ''),
    })
    const config = build({ chainTracks: [...chain, ...chain] })
    assert.deepEqual(
      config.tracks!.slice(-2).map(t => t.name),
      [
        `${acc} (human) to genark GCF_000001635.27 liftOver`,
        `${acc} to mm39 liftOver`,
      ],
    )
  })
})

describe('parseTargetAssembly', () => {
  it('reads both pif naming schemes', () => {
    assert.equal(parseTargetAssembly('GCF_1ToGCF_2'), 'GCF_2')
    assert.equal(parseTargetAssembly('hg38.mm39'), 'mm39')
    assert.equal(parseTargetAssembly('nonsense'), undefined)
  })
})
