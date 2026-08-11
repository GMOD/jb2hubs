import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildStrainMafTrack,
  buildStrainSyntenyTrack,
} from './buildStrainAlignmentTracks.ts'

const acc = 'GCA_921999865.2'
const strainName = 'C57BL_6NJ'

const maf = () =>
  buildStrainMafTrack({
    acc,
    strainName,
    bigMafFile: `${strainName}Tomm39.bb`,
  })

describe('buildStrainMafTrack', () => {
  // `bigMafLocation` is not a slot BigMafAdapter declares, and an undeclared
  // slot is silently ignored rather than rejected — so the adapter fell back to
  // the schema default `/path/to/my.bb` and the track could never load. Nothing
  // caught it: checkConfigCompat boots the configs on disk, and this track is
  // only written when the `.bb` exists locally, so none of them contains it.
  it('names the file in the slot the adapter actually reads', () => {
    const { adapter } = maf()
    assert.deepEqual(adapter.bigBedLocation, {
      uri: 'liftOver/C57BL_6NJTomm39.bb',
    })
    assert.equal('bigMafLocation' in adapter, false)
  })

  // A MafTrack has one reference and the rest are rows. The bigBed is in the
  // target's (the strain's) coordinates, so listing mm39 as well — copied from
  // the synteny track, which really does span two — offered the track on mm39
  // views, where its coordinates mean nothing.
  it('is a single-assembly track, on the strain it is built against', () => {
    assert.deepEqual(maf().assemblyNames, [acc])
  })

  // Deliberate, and the one MAF track in the repo for which it is right: both
  // sidecars are UCSC files built beside a multiz, and this is a pairwise chain
  // converted out of band. The two hub paths wire them whenever the trackDb
  // names them.
  it('wires no summary or frames sidecar for a chain-derived pairwise maf', () => {
    const { adapter } = maf()
    assert.equal('summaryAdapter' in adapter, false)
    assert.equal('annotationAdapter' in adapter, false)
  })

  // Rows come from the file's own source tokens. A configured id has to match a
  // token exactly and a set that matches nothing drops every row rather than
  // falling back, so guessing the converter's db names would be worse than not
  // guessing.
  it('leaves the row set to discovery', () => {
    assert.equal('samples' in maf().adapter, false)
  })
})

describe('buildStrainSyntenyTrack', () => {
  it('spans both assemblies, target first', () => {
    const track = buildStrainSyntenyTrack({
      acc,
      strainName,
      pifFile: `${strainName}Tomm39.pif.gz`,
    })
    assert.deepEqual(track.assemblyNames, [acc, 'mm39'])
    assert.equal(track.adapter.targetAssembly, acc)
    assert.equal(track.adapter.queryAssembly, 'mm39')
    assert.deepEqual(track.adapter.index, {
      location: { uri: 'liftOver/C57BL_6NJTomm39.pif.gz.csi' },
      indexType: 'CSI',
    })
  })
})
