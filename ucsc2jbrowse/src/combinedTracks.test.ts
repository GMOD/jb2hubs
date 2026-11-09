import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  autoSqlFields,
  combinedLine,
  combinedSources,
  combinedTrack,
  unionColumns,
  withoutSharedSuffix,
} from './combinedTracks.ts'

import type { CombinedFamily } from './combinedTracks.ts'
import type { TrackDbEntry } from './types.ts'

function entry(
  tableName: string,
  type: string,
  settings: string[],
  shortLabel = tableName,
): TrackDbEntry {
  return {
    tableName,
    settings: settings.join('\n'),
    html: '<p>about</p>',
    longLabel: `${shortLabel} long`,
    grp: 'regulation',
    shortLabel,
    type,
  }
}

const tracksDb: Record<string, TrackDbEntry> = {
  fiber: entry(
    'fiber',
    'bigWig',
    ['compositeTrack on', 'urls name="https://example.org/$$"'],
    'Fiber-seq',
  ),
  fiberView: entry('fiberView', 'bigWig', ['parent fiber', 'view peaks']),
  b_peaks: entry(
    'b_peaks',
    'bigNarrowPeak',
    [
      'parent fiberView on',
      'priority 2',
      'bigDataUrl /gbdb/hg38/fiber/b.bb',
      'mouseOver <b>K562 FIRE</b> ${signalValue}',
    ],
    'K562 Peaks',
  ),
  a_peaks: entry(
    'a_peaks',
    'bigNarrowPeak',
    [
      'parent fiber off',
      'priority 1',
      'bigDataUrl /gbdb/hg38/fiber/a.bb',
      'mouseOver <b>GM12878 FIRE</b> ${signalValue}',
    ],
    'GM12878 Peaks',
  ),
  a_signal: entry(
    'a_signal',
    'bigWig',
    ['parent fiber on', 'bigDataUrl /gbdb/hg38/fiber/a.bw'],
    'GM12878 Signal',
  ),
  hub_peaks: entry(
    'hub_peaks',
    'bigNarrowPeak',
    ['parent fiber on', 'bigDataUrl https://example.org/c.bb'],
    'Hub Peaks',
  ),
  other: entry('other', 'bigNarrowPeak', [
    'parent elsewhere',
    'bigDataUrl /gbdb/hg38/x.bb',
  ]),
}

const family: CombinedFamily = {
  composite: 'fiber',
  type: 'bigNarrowPeak',
  display: 'rows',
}

describe('combinedSources', () => {
  it('takes the gbdb subtracks of the type, nested or not, in priority order', () => {
    assert.deepEqual(
      combinedSources(tracksDb, family).map(s => [
        s.table,
        s.label,
        s.gbdbPath,
      ]),
      [
        ['a_peaks', 'GM12878', 'hg38/fiber/a.bb'],
        ['b_peaks', 'K562', 'hg38/fiber/b.bb'],
      ],
    )
  })

  it('finds nothing once the composite is gone', () => {
    assert.deepEqual(
      combinedSources(tracksDb, { ...family, composite: 'gone' }),
      [],
    )
  })
})

describe('withoutSharedSuffix', () => {
  it('drops whole trailing words every label shares', () => {
    assert.deepEqual(withoutSharedSuffix(['A Peaks', 'B C Peaks']), {
      labels: ['A', 'B C'],
      suffix: 'Peaks',
    })
  })

  it('keeps labels that share only letters, or would be emptied', () => {
    assert.deepEqual(withoutSharedSuffix(['Domains', 'Chains']), {
      labels: ['Domains', 'Chains'],
      suffix: '',
    })
    assert.deepEqual(withoutSharedSuffix(['Peaks', 'A Peaks']), {
      labels: ['Peaks', 'A Peaks'],
      suffix: '',
    })
  })
})

describe('combinedTrack', () => {
  it('opens on the declared display, with one tooltip naming each row and the composite links', () => {
    const track = combinedTrack('hg38', family, tracksDb)
    assert.ok(track)
    assert.equal(track.trackId, 'hg38-fiber-bigNarrowPeak')
    assert.equal(track.name, 'Fiber-seq - Peaks (combined)')
    assert.deepEqual(track.category, ['Regulation'])
    assert.deepEqual(track.metadata?.ucsc, {
      urls: 'name="https://example.org/$$"',
      mouseOver: '<b>${source} FIRE</b> ${signalValue}',
      html: '<p>about</p>',
    })
    assert.deepEqual(track.displays, [
      {
        type: 'LinearMultiRowFeatureDisplay',
        displayId: 'hg38-fiber-bigNarrowPeak-LinearMultiRowFeatureDisplay',
        rows: { field: 'source', sort: ['GM12878', 'K562'] },
      },
      {
        type: 'LinearBasicDisplay',
        displayId: 'hg38-fiber-bigNarrowPeak-LinearBasicDisplay',
        facet: { field: 'source', sort: ['GM12878', 'K562'] },
        maxFeatureScreenDensity: 2,
      },
    ])
  })

  it('adds no track for a family down to one source', () => {
    const { b_peaks, ...rest } = tracksDb
    assert.ok(b_peaks)
    assert.equal(combinedTrack('hg38', family, rest), undefined)
  })
})

describe('combined BED lines', () => {
  const autoSql = `table bed6
"comment"
(
string chrom;      "Reference"
uint   chromStart; "Start"
uint   chromEnd;   "End"
int[blockCount] blockSizes; "sizes"
string status;     "Status"
)`

  it('reads autoSql field names in order', () => {
    assert.deepEqual(autoSqlFields(autoSql), [
      'chrom',
      'chromStart',
      'chromEnd',
      'blockSizes',
      'status',
    ])
  })

  it('places each source in the union of columns, blank where it has none', () => {
    const union = unionColumns([
      ['chrom', 'chromStart', 'chromEnd', 'geneName', 'status'],
      ['chrom', 'chromStart', 'chromEnd', 'status', 'varType'],
    ])
    assert.equal(
      combinedLine(
        union,
        ['chrom', 'chromStart', 'chromEnd', 'status', 'varType'],
        ['chr1', 5, 9, 'Reviewed', 'SNP'],
        'Mutations',
      ),
      'chr1\t5\t9\t\tReviewed\tSNP\tMutations\n',
    )
  })
})
