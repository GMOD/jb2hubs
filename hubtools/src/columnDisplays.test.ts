import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { addColumnDisplay } from './columnDisplays.ts'
import { isRecord } from './util.ts'

import type { Track } from './types.ts'

function track(trackId: string, adapterType: string, displays?: unknown[]) {
  return {
    trackId,
    type: 'FeatureTrack',
    adapter: { type: adapterType },
    ...(displays ? { displays } : {}),
  }
}

function displaysOf(t: Track) {
  const { displays } = addColumnDisplay(t)
  assert.ok(Array.isArray(displays), 'expected a displays array')
  return displays.filter(isRecord)
}

const basic = {
  type: 'LinearBasicDisplay',
  displayId: 'hg38-gnomadGenomesVariantsV4_1-LinearBasicDisplay',
  mouseover: 'jexl:get(feature,"name")',
}

describe('addColumnDisplay', () => {
  it('puts the allele-frequency plot ahead of the derived display', () => {
    const displays = displaysOf(
      track('hg38-gnomadGenomesVariantsV4_1', 'BigBedAdapter', [basic]),
    )
    assert.deepEqual(
      displays.map(d => d.type),
      ['LinearMarkDisplay', 'LinearBasicDisplay'],
    )
    assert.deepEqual(displays[1], basic)
  })

  it('plots -log10(p) for the GWAS Catalog on any assembly', () => {
    for (const db of ['hg38', 'hg19']) {
      const [first] = displaysOf(track(`${db}-gwasCatalog`, 'BedTabixAdapter'))
      assert.equal(first!.type, 'LinearManhattanDisplay')
      assert.equal(first!.displayId, `${db}-gwasCatalog-LinearManhattanDisplay`)
    }
  })

  it('opens JASPAR 2026 as a score plot, and leaves older releases alone', () => {
    const [first] = displaysOf(track('hg38-jaspar2026', 'BigBedAdapter'))
    assert.equal(first!.type, 'LinearMarkDisplay')
    const older = track('hg38-jaspar2022', 'BigBedAdapter')
    assert.deepEqual(addColumnDisplay(older), older)
  })

  it('offers ClinVar and cCRE rows behind the packed view', () => {
    const clinvarBasic = {
      type: 'LinearBasicDisplay',
      displayId: 'hg38-clinvarMain-LinearBasicDisplay',
    }
    assert.deepEqual(
      displaysOf(
        track('hg38-clinvarMain', 'BigBedAdapter', [clinvarBasic]),
      ).map(d => d.type),
      ['LinearBasicDisplay', 'LinearMultiRowFeatureDisplay'],
    )
    const ccre = displaysOf(track('hg38-cCREregistry', 'BigBedAdapter'))
    assert.deepEqual(
      ccre.map(d => d.displayId),
      [
        'hg38-cCREregistry-LinearBasicDisplay',
        'hg38-cCREregistry-LinearMultiRowFeatureDisplay',
      ],
    )
  })

  it('is idempotent', () => {
    const once = addColumnDisplay(
      track('hg38-gnomadExomesVariantsV4_1', 'BigBedAdapter', [basic]),
    )
    assert.deepEqual(addColumnDisplay(once), once)
  })

  it('leaves other tracks, and a table under an unexpected adapter, alone', () => {
    for (const t of [
      track('hg38-gnomadGenomesVariantsV3_1', 'BigBedAdapter'),
      track('hg38-gwasCatalog', 'BigBedAdapter'),
      track('GCF_000001405.40-gwasCatalogLike', 'BedTabixAdapter'),
    ]) {
      assert.deepEqual(addColumnDisplay(t), t)
    }
  })
})
