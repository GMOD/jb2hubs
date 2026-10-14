import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createTrackConfiguration } from './createTrackConfiguration.ts'

import type { RaStanza, TrackDbFile } from '@gmod/ucsc-hub'

const sequenceAdapter = { type: 'TwoBitAdapter', uri: 'seq.2bit' }
const trackDbUrl = 'https://example.com/hub/hg38/trackDb.txt'

function build(data: Record<string, string>) {
  const track = { name: data.track, data } as unknown as RaStanza
  const trackDb = { data: { [data.track!]: track } } as unknown as TrackDbFile
  return createTrackConfiguration({
    track,
    trackName: data.track!,
    trackDb,
    trackDbUrl,
    sequenceAdapter,
    assemblyName: 'hg38',
  })
}

function aggregateFieldOf(conf: ReturnType<typeof createTrackConfiguration>) {
  const adapter = conf?.adapter
  return adapter && 'aggregateField' in adapter
    ? adapter.aggregateField
    : undefined
}

describe('createTrackConfiguration aggregateField derivation', () => {
  it('sets aggregateField from defaultLabelFields for bigGenePred', () => {
    const conf = build({
      track: 'ncbiRefSeq',
      type: 'bigGenePred',
      bigDataUrl: 'ncbiRefSeq.bb',
      shortLabel: 'RefSeq All',
      labelFields: 'name2,geneName,geneName2',
      defaultLabelFields: 'name2',
    })
    assert.equal(aggregateFieldOf(conf), 'name2')
  })

  it('falls back to first labelFields when no default', () => {
    const conf = build({
      track: 'ncbiRefSeq',
      type: 'bigGenePred',
      bigDataUrl: 'ncbiRefSeq.bb',
      shortLabel: 'RefSeq All',
      labelFields: 'geneName,geneName2',
    })
    assert.equal(aggregateFieldOf(conf), 'geneName')
  })

  it('leaves aggregateField unset for non-bigGenePred big tracks', () => {
    const conf = build({
      track: 'someBigBed',
      type: 'bigBed',
      bigDataUrl: 'someBigBed.bb',
      shortLabel: 'Some bigBed',
      defaultLabelFields: 'name',
    })
    assert.equal(aggregateFieldOf(conf), undefined)
  })
})

function mafAdapterOf(conf: ReturnType<typeof createTrackConfiguration>) {
  const adapter = conf?.adapter
  return adapter && 'bigBedLocation' in adapter ? adapter : undefined
}

const mafTrackDb = {
  track: 'bigMaf',
  type: 'bigMaf',
  bigDataUrl: 'maf/hg38.bigMaf.bb',
  shortLabel: 'Alignment',
  summary: 'maf/hg38.bigMafSummary.bb',
  frames: 'maf/hg38.bigMafFrames.bb',
  speciesOrder: 'mm10 rn6',
}

describe('createTrackConfiguration bigMaf wiring', () => {
  it('wires frames as the annotation sub-adapter', () => {
    const adapter = mafAdapterOf(build(mafTrackDb))
    assert.deepEqual(adapter?.annotationAdapter, {
      type: 'BigBedAdapter',
      bigBedLocation: {
        uri: 'https://example.com/hub/hg38/maf/hg38.bigMafFrames.bb',
      },
    })
  })

  it('emits speciesOrder as samples, reference genome first', () => {
    const adapter = mafAdapterOf(build(mafTrackDb))
    assert.deepEqual(adapter?.samples, [
      { id: 'hg38', label: 'hg38' },
      { id: 'mm10', label: 'mm10' },
      { id: 'rn6', label: 'rn6' },
    ])
  })

  it('omits samples entirely when the hub lists no species', () => {
    const { speciesOrder: _speciesOrder, ...noOrder } = mafTrackDb
    assert.equal(mafAdapterOf(build(noOrder))?.samples, undefined)
  })

  it('reads the species from sGroup_ clades, labeled by speciesLabels', () => {
    const { speciesOrder: _speciesOrder, ...noOrder } = mafTrackDb
    const adapter = mafAdapterOf(
      build({
        ...noOrder,
        speciesGroups: 'Reptiles Mammals_Other',
        sGroup_Reptiles: 'GCA_040894355.2 hg38',
        sGroup_Mammals_Other: 'GCF_019393635.1',
        speciesLabels:
          'GCA_040894355.2="Bellinger river turtle" GCF_019393635.1="dunnart"',
      }),
    )
    assert.deepEqual(adapter?.samples, [
      { id: 'hg38', label: 'hg38' },
      { id: 'GCA_040894355.2', label: 'Bellinger river turtle' },
      { id: 'GCF_019393635.1', label: 'dunnart' },
    ])
  })
})

describe('createTrackConfiguration gene heuristic', () => {
  function buildUnder(
    data: Record<string, string>,
    parent: Record<string, string>,
  ) {
    const stanza = (d: Record<string, string>) =>
      ({ name: d.track, data: d }) as unknown as RaStanza
    const trackDb = {
      data: { [data.track!]: stanza(data), [parent.track!]: stanza(parent) },
    } as unknown as TrackDbFile
    return createTrackConfiguration({
      track: stanza(data),
      trackName: data.track!,
      trackDb,
      trackDbUrl,
      sequenceAdapter,
      assemblyName: 'hg38',
    })
  }

  const unipDomain = {
    track: 'unipDomain',
    parent: 'uniprot',
    type: 'bigBed 12 +',
    bigDataUrl: 'unipDomain.bb',
  }

  it("turns it off under a parent's exonNumbers off", () => {
    const conf = buildUnder(unipDomain, {
      track: 'uniprot',
      compositeTrack: 'on',
      exonNumbers: 'off',
    })
    assert.deepEqual(conf?.adapter, {
      type: 'BigBedAdapter',
      uri: 'https://example.com/hub/hg38/unipDomain.bb',
      disableGeneHeuristic: true,
    })
  })

  it("lets a track's own exonNumbers override its parent's", () => {
    const conf = buildUnder(
      { ...unipDomain, exonNumbers: 'on' },
      { track: 'uniprot', compositeTrack: 'on', exonNumbers: 'off' },
    )
    assert.equal(conf?.adapter && 'disableGeneHeuristic' in conf.adapter, false)
  })

  it("turns it off for GenArk's tandemDups, which trackDb leaves unmarked", () => {
    const conf = build({
      track: 'tandemDups',
      type: 'bigBed 12',
      bigDataUrl: 'tandemDups.bb',
    })
    assert.equal(conf?.adapter && 'disableGeneHeuristic' in conf.adapter, true)
  })
})

describe('createTrackConfiguration type', () => {
  it('inherits the type from a composite above a view', () => {
    const stanza = (data: Record<string, string>) =>
      ({ name: data.track, data }) as unknown as RaStanza
    const track = stanza({
      track: 'sub',
      parent: 'view on',
      bigDataUrl: 'sub.bb',
      shortLabel: 'Sub',
    })
    const trackDb = {
      data: {
        sub: track,
        view: stanza({ track: 'view', parent: 'comp', view: 'v' }),
        comp: stanza({ track: 'comp', compositeTrack: 'on', type: 'bigBed 6' }),
      },
    } as unknown as TrackDbFile
    const conf = createTrackConfiguration({
      track,
      trackName: 'sub',
      trackDb,
      trackDbUrl,
      sequenceAdapter,
      assemblyName: 'hg38',
    })
    assert.equal(conf?.adapter.type, 'BigBedAdapter')
  })
})
