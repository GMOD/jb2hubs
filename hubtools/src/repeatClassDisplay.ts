// Adds a "split by repeat class" multi-row display to a RepeatMasker track, so
// the same file can be read as one lane per class instead of one packed lane of
// colored blocks. Covers both pipelines, which store the class differently:
//
// - **UCSC golden path** (`<db>-rmsk`, BedTabixAdapter): a real `repClass`
//   column. `ucsc2jbrowse/src/rmskLike.ts` writes the header
//   `#genoName genoStart genoEnd name strand repFamily repClass ...` and the
//   adapter picks the names up off it, so `partitionField: 'repClass'`.
// - **GenArk** (`<acc>-repeatMasker`, BigBedAdapter): a `bigRmskBed`, whose
//   autoSql has no class column — the class is a suffix on the name
//   (`L1HS#LINE/L1`, `(ACCTA)n#Simple_repeat`). Partitioning on `name` would be
//   thousands of rows, one per repeat, so the class is derived with a jexl
//   `partitionField` instead. Verified against the real files: 0 of 3,429
//   features sampled on GCF_950023065.1 lack the `#`.
//
// Neither needs data preparation: LinearMultiRowFeatureDisplay discovers its
// rows from whatever partition values the loaded region holds. So this is config
// only, on both sides.
//
// What the config DOES have to supply is stability. Rows are the union of the
// values in the loaded regions, so a class drops out of the stack the moment you
// pan somewhere it has no annotation (measured on hg38: 11 classes over a 1 Mb
// 17q window, 5 over 100 kb of chr1). Any row not named in `sampleColorMap` then
// takes a palette color BY ROW INDEX, so a Satellite row appearing at the top
// recolors every row under it. Naming the whole vocabulary keeps a class's color
// and position fixed no matter which classes the window happens to contain, and
// one vocabulary serves both pipelines because both are RepeatMasker.
import { isRecord } from './util.ts'

import type { Track } from './types.ts'

// Measured over 8 Mb windows on hg38, mm39, danRer11, dm6, ce11 and galGal6:
// 19 distinct values. The `?` classes are RepeatMasker's uncertain calls and
// take the color of the class they probably are; the small RNA genes share one
// hue because they are one story told five ways; anything unresolved is gray.
// The first six match the cookbook's `repClass` lookup table, so the docs and
// the hubs paint the same repeat the same color.
const REPEAT_CLASS_COLORS: Record<string, string> = {
  SINE: '#e41a1c',
  'SINE?': '#e41a1c',
  LINE: '#377eb8',
  'LINE?': '#377eb8',
  LTR: '#4daf4a',
  'LTR?': '#4daf4a',
  DNA: '#984ea3',
  'DNA?': '#984ea3',
  Simple_repeat: '#ff7f00',
  Low_complexity: '#a65628',
  Satellite: '#f781bf',
  'Satellite?': '#f781bf',
  RC: '#17becf',
  'RC?': '#17becf',
  Retroposon: '#bcbd22',
  rRNA: '#8da0cb',
  tRNA: '#8da0cb',
  snRNA: '#8da0cb',
  scRNA: '#8da0cb',
  srpRNA: '#8da0cb',
  RNA: '#8da0cb',
  Unknown: '#999999',
  Other: '#7f7f7f',
}

// Interspersed elements first, largest and most-read first within that, then the
// tandem/low-complexity lanes, then the RNA genes, then the leftovers. A value
// listed here but absent from the window is simply skipped, and a value not
// listed is appended in sorted order, so this never has to be exhaustive — it
// only has to be stable.
const REPEAT_CLASS_ORDER = [
  'SINE',
  'LINE',
  'LTR',
  'DNA',
  'RC',
  'Retroposon',
  'Simple_repeat',
  'Low_complexity',
  'Satellite',
  'rRNA',
  'tRNA',
  'snRNA',
  'scRNA',
  'srpRNA',
  'RNA',
  'SINE?',
  'LINE?',
  'LTR?',
  'DNA?',
  'RC?',
  'Satellite?',
  'Unknown',
  'Other',
]

const MULTI_ROW = 'LinearMultiRowFeatureDisplay'
const BASIC = 'LinearBasicDisplay'

// `name#class/family` -> `class`. The nesting reads badly and is still the whole
// derivation: the inner split takes what follows the '#', the outer drops the
// family. Swap the final [0] for [1] to split by family instead.
const RMSK_NAME_CLASS = "jexl:split(split(feature.name,'#')[1],'/')[0]"

export function repeatClassDisplay(trackId: string, partitionField: string) {
  return {
    type: MULTI_ROW,
    displayId: `${trackId}-${MULTI_ROW}`,
    partitionField,
    sampleColorMap: REPEAT_CLASS_COLORS,
    rowOrder: REPEAT_CLASS_ORDER,
    showRowSeparators: true,
  }
}

// How this track stores its repeat class, or undefined if it is not one of the
// two RepeatMasker tracks. Both matches are narrow on purpose: `-rmsk` as a
// whole trackId segment excludes `rmskJoinedCurrent` (a different table with
// different columns), and pairing each trackId with the adapter the pipeline
// built for it excludes anything a trackDb happens to have named similarly.
function repeatClassPartitionField(track: Track) {
  if (track.type !== 'FeatureTrack' || !isRecord(track.adapter)) {
    return undefined
  }
  const adapterType = track.adapter.type
  if (/(^|-)rmsk$/.test(track.trackId) && adapterType === 'BedTabixAdapter') {
    return 'repClass'
  }
  return track.trackId.endsWith('-repeatMasker') &&
    adapterType === 'BigBedAdapter'
    ? RMSK_NAME_CLASS
    : undefined
}

/**
 * Append the by-class display to a RepeatMasker track, leaving every other track
 * alone. Idempotent, so a re-run over an already-enhanced config is a no-op.
 *
 * The multi-row entry goes LAST on purpose. `pickDisplayForView` takes the first
 * declared display the view supports, ahead of the track type's own default, so
 * declaring multi-row alone would silently make the painting the default view of
 * RepeatMasker for everyone. A track with no displays yet gets an explicit bare
 * `LinearBasicDisplay` first to hold that position — a no-op in content, since
 * baseTrackConfig injects exactly that entry anyway, and it pins the default.
 */
export function addRepeatClassDisplay(track: Track): Track {
  const partitionField = repeatClassPartitionField(track)
  if (partitionField === undefined) {
    return track
  }
  const existing: unknown[] | undefined = Array.isArray(track.displays)
    ? track.displays
    : undefined
  if (existing?.some(d => isRecord(d) && d.type === MULTI_ROW)) {
    return track
  }
  const before = existing ?? [
    { type: BASIC, displayId: `${track.trackId}-${BASIC}` },
  ]
  return {
    ...track,
    displays: [...before, repeatClassDisplay(track.trackId, partitionField)],
  }
}
