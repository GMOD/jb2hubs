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
    assert.deepEqual(track.adapter, {
      type: 'BedTabixAdapter',
      bedGzLocation: { uri: 'combined/fiber-bigNarrowPeak.bed.gz' },
      index: {
        indexType: 'CSI',
        location: { uri: 'combined/fiber-bigNarrowPeak.bed.gz.csi' },
      },
    })
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

describe('a supertrack family over upstream bigBeds', () => {
  const superDb: Record<string, TrackDbEntry> = {
    map: entry('map', 'bigWig', ['superTrack on'], 'Mappability'),
    bis: entry('bis', 'bigBed 6', ['parent map', 'priority 1'], 'Bismap'),
    umap: entry('umap', 'bigBed 6', ['parent map', 'priority 2'], 'Umap'),
    umap24: entry(
      'umap24',
      'bigBed 6',
      [
        'parent umap on',
        'priority 1',
        'color 80,20,240',
        'bigDataUrl /gbdb/hg38/m/k24.bb',
      ],
      'Umap S24',
    ),
    bis36: entry(
      'bis36',
      'bigBed 6',
      ['parent bis off', 'priority 2', 'bigDataUrl /gbdb/hg38/m/b36.bb'],
      'Bismap S36',
    ),
    bis24: entry(
      'bis24',
      'bigBed 6',
      [
        'parent bis on',
        'priority 9',
        'color 240,20,80',
        'bigDataUrl /gbdb/hg38/m/b24.bb',
      ],
      'Bismap S24',
    ),
  }
  const mappability: CombinedFamily = {
    composite: 'map',
    type: 'bigBed',
    display: 'rows',
    combine: 'adapters',
  }

  it('keeps each composite together, in the composites own order', () => {
    assert.deepEqual(
      combinedSources(superDb, mappability).map(s => s.label),
      ['Bismap S36', 'Bismap S24', 'Umap S24'],
    )
  })

  it('reads each upstream file through a subadapter, rows in trackDb colors', () => {
    const track = combinedTrack('hg38', mappability, superDb)
    assert.ok(track)
    assert.deepEqual(track.adapter, {
      type: 'MultiWiggleAdapter',
      subadapters: [
        ['Bismap S36', 'b36.bb'],
        ['Bismap S24', 'b24.bb'],
        ['Umap S24', 'k24.bb'],
      ].map(([source, file]) => ({
        type: 'BigBedAdapter',
        source,
        bigBedLocation: {
          locationType: 'UriLocation',
          uri: `https://hgdownload.soe.ucsc.edu/gbdb/hg38/m/${file}`,
        },
      })),
    })
    const sort = ['Bismap S36', 'Bismap S24', 'Umap S24']
    assert.deepEqual(track.displays, [
      {
        type: 'LinearMultiRowFeatureDisplay',
        displayId: 'hg38-map-bigBed-LinearMultiRowFeatureDisplay',
        rows: {
          field: 'source',
          sort,
          colors: {
            'Bismap S24': 'rgb(240,20,80)',
            'Umap S24': 'rgb(80,20,240)',
          },
        },
      },
      {
        type: 'LinearBasicDisplay',
        displayId: 'hg38-map-bigBed-LinearBasicDisplay',
        facet: { field: 'source', sort },
        maxFeatureScreenDensity: 3,
      },
    ])
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
