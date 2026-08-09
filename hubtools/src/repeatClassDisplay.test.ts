import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { addRepeatClassDisplay } from './repeatClassDisplay.ts'
import { isRecord } from './util.ts'

import type { Track } from './types.ts'

const rmsk = {
  trackId: 'hg38-rmsk',
  type: 'FeatureTrack',
  adapter: { type: 'BedTabixAdapter', bedGzLocation: { uri: 'rmsk.bed.gz' } },
}

// A config read off disk is unknown all the way down (see the Track type), so
// walk into it rather than asserting a shape onto it.
function displaysOf(track: Track) {
  const { displays } = addRepeatClassDisplay(track)
  assert.ok(Array.isArray(displays), 'expected a displays array')
  return displays.filter(isRecord)
}

describe('addRepeatClassDisplay', () => {
  it('appends the by-class display to a golden-path RepeatMasker track', () => {
    const displays = displaysOf(rmsk)
    assert.equal(displays.length, 2)
    assert.equal(displays[1]!.type, 'LinearMultiRowFeatureDisplay')
    assert.equal(displays[1]!.partitionField, 'repClass')
    assert.equal(
      displays[1]!.displayId,
      'hg38-rmsk-LinearMultiRowFeatureDisplay',
    )
  })

  it('keeps LinearBasicDisplay first, so the packed view stays the default', () => {
    // pickDisplayForView takes the FIRST declared display the view supports, so
    // an entry ahead of the multi-row one is what stops the painting becoming
    // the default view of RepeatMasker.
    assert.equal(displaysOf(rmsk)[0]!.type, 'LinearBasicDisplay')
  })

  it('appends after a derived display rather than replacing it', () => {
    const derived = {
      type: 'LinearBasicDisplay',
      displayId: 'hg38-rmsk-LinearBasicDisplay',
      mouseover: "jexl:get(feature,'repName')",
    }
    const displays = displaysOf({ ...rmsk, displays: [derived] })
    assert.deepEqual(displays[0], derived)
    assert.equal(displays[1]!.type, 'LinearMultiRowFeatureDisplay')
  })

  it('is idempotent', () => {
    const once = addRepeatClassDisplay(rmsk)
    assert.deepEqual(addRepeatClassDisplay(once), once)
  })

  it('colors and orders every class it names', () => {
    const { sampleColorMap, rowOrder } = displaysOf(rmsk)[1]!
    assert.ok(isRecord(sampleColorMap))
    assert.ok(Array.isArray(rowOrder))
    // Every ordered row has a color and every colored class has a position: a
    // class in one and not the other is the case where a row silently falls
    // back to a palette color assigned by row index, which moves when the row
    // set does.
    assert.deepEqual(
      Object.keys(sampleColorMap).sort(),
      [...rowOrder].sort(),
      'sampleColorMap and rowOrder must name the same classes',
    )
    // The vocabulary measured off the shipped files: 8 Mb windows on hg38,
    // mm39, danRer11, dm6, ce11 and galGal6.
    for (const cls of [
      'SINE',
      'LINE',
      'LTR',
      'DNA',
      'Simple_repeat',
      'Low_complexity',
      'Satellite',
      'RC',
      'Retroposon',
      'Unknown',
      'Other',
      'DNA?',
      'LTR?',
      'Satellite?',
      'rRNA',
      'tRNA',
      'snRNA',
      'scRNA',
      'srpRNA',
    ]) {
      assert.ok(sampleColorMap[cls], `no color for measured class ${cls}`)
    }
  })

  it('derives the class from the name on a GenArk bigRmskBed', () => {
    // no class column there: the class is a suffix on the name (L1HS#LINE/L1),
    // so partitioning on `name` would be one row per repeat
    const displays = displaysOf({
      trackId: 'GCF_950023065.1-repeatMasker',
      type: 'FeatureTrack',
      adapter: { type: 'BigBedAdapter', uri: 'x.rmsk.bb' },
    })
    assert.equal(displays[1]!.type, 'LinearMultiRowFeatureDisplay')
    assert.equal(
      displays[1]!.partitionField,
      "jexl:split(split(feature.name,'#')[1],'/')[0]",
    )
    // one vocabulary for both pipelines, because both are RepeatMasker
    assert.deepEqual(
      displays[1]!.sampleColorMap,
      displaysOf(rmsk)[1]!.sampleColorMap,
    )
  })

  it('leaves the joined-rmsk tables and everything else alone', () => {
    const untouched = [
      // a different table with different columns, and no repClass
      { ...rmsk, trackId: 'hg38-rmskJoinedCurrent' },
      // the trackId matches but the adapter says it is not the file we built
      {
        trackId: 'GCF_950023065.1-repeatMasker',
        type: 'FeatureTrack',
        adapter: { type: 'BedTabixAdapter', uri: 'x.bed.gz' },
      },
      {
        trackId: 'hg38-simpleRepeat',
        type: 'FeatureTrack',
        adapter: rmsk.adapter,
      },
      {
        trackId: 'hg38-unipRepeat',
        type: 'FeatureTrack',
        adapter: rmsk.adapter,
      },
    ]
    for (const track of untouched) {
      assert.deepEqual(addRepeatClassDisplay(track), track, track.trackId)
    }
  })
})
