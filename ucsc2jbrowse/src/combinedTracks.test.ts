import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  autoSqlFields,
  combinedLine,
  combinedSources,
  combinedTrack,
  replacedTrackIds,
  signalTracks,
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
      html: '<a href="https://jbrowse.org/ucsc/hg38/descriptions/fiber.html">Track description</a>',
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

describe('a faceted composite', () => {
  const sample = (
    id: string,
    name: string,
    priority: number,
  ): [string, TrackDbEntry][] => {
    const table = (kind: string) => `comp_${id}_${kind}`
    const leaf = (
      kind: string,
      type: string,
      label: string,
      file: string,
      offset: number,
    ) =>
      [
        table(kind),
        {
          ...entry(
            table(kind),
            type,
            [
              'parent comp on',
              `priority ${priority + offset}`,
              'color 0,0,0',
              'autoScale off',
              'viewLimits 0:100',
              'windowingFunction maximum',
              `bigDataUrl /gbdb/hg38/f/${id}/${file}`,
            ],
            `${name} ${label}`,
          ),
          longLabel: `${name} Fiber-seq ${label.toLowerCase()}, both haplotypes`,
        },
      ] as [string, TrackDbEntry]
    const hap = (n: number, color: string) =>
      [
        `${table('hap')}_h${n}`,
        entry(
          `${table('hap')}_h${n}`,
          'bigWig',
          [
            `parent ${table('hap')}`,
            `priority ${n}`,
            `color ${color}`,
            `bigDataUrl /gbdb/hg38/f/${id}/hap${n}.bw`,
          ],
          `${name} Hap${n}`,
        ),
      ] as [string, TrackDbEntry]
    return [
      leaf('acc', 'bigWig', 'Acc', 'acc.bw', 1),
      leaf('peaks', 'bigNarrowPeak', 'Peaks', 'peaks.bb', 2),
      [
        table('hap'),
        {
          ...entry(
            table('hap'),
            'bigWig 0 100',
            [
              'parent comp off',
              `priority ${priority + 3}`,
              'container multiWig',
              'aggregate transparentOverlay',
              'autoScale off',
              'viewLimits 0:100',
              'windowingFunction maximum',
            ],
            `${name} Hap1/2`,
          ),
          longLabel: `${name} Fiber-seq percent accessible, by haplotype`,
        },
      ],
      hap(1, '0,114,178'),
      hap(2, '213,94,0'),
    ]
  }
  const facetedDb: Record<string, TrackDbEntry> = Object.fromEntries([
    [
      'comp',
      entry(
        'comp',
        'bigWig',
        [
          'compositeTrack faceted',
          'noInherit on',
          'dataTypes acc|"Percent accessible" peaks|"FIRE peaks" hap|"Haplotype accessibility"',
        ],
        'Fiber-seq Compendium',
      ),
    ],
    ...sample('PM2', 'HG002', 10),
    ...sample('PM1', 'GM12878', 0),
  ])
  const signal: CombinedFamily = {
    composite: 'comp',
    type: 'bigWig',
    display: 'rows',
  }
  const peaks: CombinedFamily = {
    composite: 'comp',
    type: 'bigNarrowPeak',
    display: 'rows',
  }
  const built = signalTracks('hg38', signal, facetedDb)
  const [acc, hap] = built.map(b => b.track)

  it('makes one track per data type, named by its label, samples in priority order', () => {
    assert.deepEqual(
      built.map(b => [b.track.trackId, b.track.name, b.track.description]),
      [
        [
          'hg38-comp-acc',
          'Fiber-seq Compendium - Percent accessible',
          'Fiber-seq acc, both haplotypes: 2 samples, one row each',
        ],
        [
          'hg38-comp-hap',
          'Fiber-seq Compendium - Haplotype accessibility',
          'Fiber-seq percent accessible, by haplotype: 2 samples, one row each',
        ],
      ],
    )
  })

  it('draws a row per sample, with the UCSC scale and summary', () => {
    assert.ok(acc)
    assert.deepEqual(acc.adapter, {
      type: 'MultiWiggleAdapter',
      subadapters: [
        ['GM12878', 'PM1'],
        ['HG002', 'PM2'],
      ].map(([name, id]) => ({
        type: 'BigWigAdapter',
        name,
        bigWigLocation: {
          uri: `https://hgdownload.soe.ucsc.edu/gbdb/hg38/f/${id}/acc.bw`,
        },
      })),
    })
    assert.deepEqual(acc.displays, [
      {
        type: 'LinearWiggleDisplay',
        displayId: 'hg38-comp-acc-LinearWiggleDisplay',
        encoding: {
          y: { field: 'maxScore', scale: { domainMin: 0, domainMax: 100 } },
        },
        rows: { field: 'source' },
      },
    ])
  })

  it('overlays a container subtracks in one row per sample, in their colors', () => {
    assert.ok(hap)
    assert.deepEqual(
      (hap.adapter.subadapters as Record<string, unknown>[]).map(
        ({ name, group, color }) => [name, group, color],
      ),
      [
        ['GM12878 Hap1', 'GM12878', 'rgb(0,114,178)'],
        ['GM12878 Hap2', 'GM12878', 'rgb(213,94,0)'],
        ['HG002 Hap1', 'HG002', 'rgb(0,114,178)'],
        ['HG002 Hap2', 'HG002', 'rgb(213,94,0)'],
      ],
    )
    assert.deepEqual(hap.displays, [
      {
        type: 'LinearWiggleDisplay',
        displayId: 'hg38-comp-hap-LinearWiggleDisplay',
        encoding: {
          y: { field: 'maxScore', scale: { domainMin: 0, domainMax: 100 } },
        },
        rows: { field: 'group' },
      },
    ])
  })

  it('names a bigBed family by its data type, keeping its trackId', () => {
    const track = combinedTrack('hg38', peaks, facetedDb)
    assert.ok(track)
    assert.equal(track.trackId, 'hg38-comp-bigNarrowPeak')
    assert.equal(track.name, 'Fiber-seq Compendium - FIRE peaks')
  })

  it('replaces the per-sample tracks and containers each family covers', () => {
    assert.deepEqual(
      built.flatMap(b =>
        replacedTrackIds('hg38', facetedDb, signal, b.sources),
      ),
      [
        'hg38-comp_PM1_acc',
        'hg38-comp_PM2_acc',
        'hg38-comp_PM1_hap_h1',
        'hg38-comp_PM1_hap',
        'hg38-comp_PM1_hap_h2',
        'hg38-comp_PM1_hap',
        'hg38-comp_PM2_hap_h1',
        'hg38-comp_PM2_hap',
        'hg38-comp_PM2_hap_h2',
        'hg38-comp_PM2_hap',
      ],
    )
  })

  it('keeps the originals of a composite with no data types', () => {
    assert.deepEqual(
      replacedTrackIds(
        'hg38',
        tracksDb,
        family,
        combinedSources(tracksDb, family),
      ),
      [],
    )
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
