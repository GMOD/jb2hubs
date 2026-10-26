// Displays that draw a column the derived LinearBasicDisplay only lists in a
// feature's details. Spelled as jbrowse-components main spells them, for
// v5.0.0-beta.18 (agent-docs/todo/write-mains-spellings-at-beta18.md).

import { isRecord } from './util.ts'

import type { Track } from './types.ts'

const ANNOT_COLORS = {
  pLoF: '#d62728',
  missense: '#ff7f0e',
  synonymous: '#2ca02c',
  other: '#9e9e9e',
}

// `y: 'AF'` rather than a jexl parse, so the tooltip names the column; a string
// column converts on its own. An AF of 0 has no place on a log axis.
function gnomadAfDisplay(trackId: string) {
  return {
    type: 'LinearMarkDisplay',
    displayId: `${trackId}-LinearMarkDisplay`,
    height: 200,
    filter: ['jexl:parseFloat(feature.AF) > 0'],
    encoding: {
      y: {
        scale: { type: 'log', domainMax: 1 },
        axis: { title: 'Allele frequency' },
      },
    },
    marks: [
      {
        mark: 'point',
        encoding: {
          y: 'AF',
          size: 5,
          color: {
            field: 'annot',
            scale: {
              type: 'ordinal',
              domain: Object.keys(ANNOT_COLORS),
              range: Object.values(ANNOT_COLORS),
            },
          },
        },
      },
    ],
  }
}

// -log10 of 5e-8, the conventional genome-wide significance threshold
const GENOME_WIDE = 7.3

function gwasManhattanDisplay(trackId: string) {
  return {
    type: 'LinearManhattanDisplay',
    displayId: `${trackId}-LinearManhattanDisplay`,
    height: 200,
    encoding: {
      y: {
        axis: { title: '-log10(p)' },
        rules: [{ value: GENOME_WIDE, label: 'p = 5e-8' }],
      },
    },
    marks: [
      {
        mark: 'point',
        transform: [
          {
            type: 'formula',
            expr: 'jexl:-log10(parseFloat(feature.pValue))',
            as: 'negLog10P',
          },
        ],
        encoding: { y: 'negLog10P', size: 5 },
      },
    ],
  }
}

// JASPAR's score is -log10(p) x 100. Over 10 kb of TP53 the 2026 file holds
// 53,888 motifs, 2,946 of them at UCSC's default 400 and 389 at 500, so the
// plot keeps p < 1e-5 and raises the strongest above the rest; the TF names
// show once a motif is wide enough to carry one.
const JASPAR_MIN_SCORE = 500

function jasparScoreDisplay(trackId: string) {
  return {
    type: 'LinearMarkDisplay',
    displayId: `${trackId}-LinearMarkDisplay`,
    height: 160,
    filter: [`jexl:feature.score >= ${JASPAR_MIN_SCORE}`],
    encoding: {
      y: {
        scale: { domainMin: JASPAR_MIN_SCORE, domainMax: 1000 },
        axis: { title: 'score (-log10 p x 100)' },
      },
    },
    marks: [
      {
        mark: 'rule',
        encoding: {
          y: 'score',
          strokeWidth: 3,
          color: {
            field: 'strand',
            scale: {
              type: 'ordinal',
              domain: ['1', '-1'],
              range: ['#1f77b4', '#d62728'],
            },
          },
        },
      },
      {
        mark: 'text',
        maxBpPerPx: 0.5,
        encoding: { y: 'score', text: 'TFName' },
      },
    ],
  }
}

const CLINVAR_CLASSES = [
  ['PG', 'Pathogenic', 'rgb(210,0,0)'],
  ['LP', 'Likely pathogenic', 'rgb(240,100,100)'],
  ['VUS', 'Uncertain significance', 'rgb(0,0,128)'],
  ['CF', 'Conflicting', 'rgb(137,121,212)'],
  ['RF', 'Risk factor', 'rgb(90,90,190)'],
  ['LB', 'Likely benign', 'rgb(100,200,100)'],
  ['BN', 'Benign', 'rgb(0,160,0)'],
  ['OT', 'Other', 'rgb(128,128,128)'],
] as const

function clinvarRowsDisplay(trackId: string) {
  return {
    type: 'LinearMultiRowFeatureDisplay',
    displayId: `${trackId}-LinearMultiRowFeatureDisplay`,
    rows: {
      field: '_clinSignCode',
      sort: CLINVAR_CLASSES.map(([code]) => code),
      labels: Object.fromEntries(CLINVAR_CLASSES.map(([code, l]) => [code, l])),
    },
    rowColor: {
      scale: {
        domain: CLINVAR_CLASSES.map(([code]) => code),
        range: CLINVAR_CLASSES.map(([, , color]) => color),
      },
    },
    legend: { show: false },
  }
}

// SCREEN's class colors, which UCSC's itemRgb also uses
const CCRE_CLASSES = [
  ['Promoter', '#ff0000'],
  ['Proximal enhancer', '#ffa700'],
  ['Distal enhancer', '#ffcd00'],
  ['CA-H3K4me3', '#ffaaaa'],
  ['CA-CTCF', '#00b0f0'],
  ['CA-TF', '#be28e5'],
  ['CA', '#06da93'],
  ['TF', '#d876ec'],
] as const

function ccreRowsDisplay(trackId: string) {
  return {
    type: 'LinearMultiRowFeatureDisplay',
    displayId: `${trackId}-LinearMultiRowFeatureDisplay`,
    rows: { field: 'cCRE_class', sort: CCRE_CLASSES.map(([c]) => c) },
    rowColor: {
      scale: {
        domain: CCRE_CLASSES.map(([c]) => c),
        range: CCRE_CLASSES.map(([, color]) => color),
      },
    },
    legend: { show: false },
  }
}

// One row per tissue, 10 px each so the rows' labels read, each eQTL in its
// tissue's GTEx color from the packed `reserved` column
function gtexTissueRowsDisplay(trackId: string) {
  return {
    type: 'LinearMultiRowFeatureDisplay',
    displayId: `${trackId}-LinearMultiRowFeatureDisplay`,
    height: 300,
    rowHeight: 10,
    rows: { field: 'tissue' },
    encoding: { color: { scale: { type: 'identity' } } },
    legend: { show: false },
  }
}

// `first` opens the track as the display; `last` offers it beside the packed
// view, which stays the default
const BY_TABLE: Record<
  string,
  {
    adapter: string
    position: 'first' | 'last'
    display: (trackId: string) => Record<string, unknown>
  }
> = {
  gnomadGenomesVariantsV4_1: {
    adapter: 'BigBedAdapter',
    position: 'first',
    display: gnomadAfDisplay,
  },
  gnomadExomesVariantsV4_1: {
    adapter: 'BigBedAdapter',
    position: 'first',
    display: gnomadAfDisplay,
  },
  gwasCatalog: {
    adapter: 'BedTabixAdapter',
    position: 'first',
    display: gwasManhattanDisplay,
  },
  jaspar2026: {
    adapter: 'BigBedAdapter',
    position: 'first',
    display: jasparScoreDisplay,
  },
  // hg19's newest release
  jaspar2024: {
    adapter: 'BigBedAdapter',
    position: 'first',
    display: jasparScoreDisplay,
  },
  clinvarMain: {
    adapter: 'BigBedAdapter',
    position: 'last',
    display: clinvarRowsDisplay,
  },
  gtexEqtlCaviar: {
    adapter: 'BigBedAdapter',
    position: 'last',
    display: gtexTissueRowsDisplay,
  },
  gtexEqtlDapg: {
    adapter: 'BigBedAdapter',
    position: 'last',
    display: gtexTissueRowsDisplay,
  },
  cCREregistry: {
    adapter: 'BigBedAdapter',
    position: 'last',
    display: ccreRowsDisplay,
  },
}

function entryFor(track: Track) {
  const table = track.trackId.slice(track.trackId.indexOf('-') + 1)
  const entry = Object.hasOwn(BY_TABLE, table) ? BY_TABLE[table] : undefined
  return entry &&
    track.type === 'FeatureTrack' &&
    isRecord(track.adapter) &&
    track.adapter.type === entry.adapter
    ? entry
    : undefined
}

/**
 * Add the table's column display, first or last as BY_TABLE says. A `last`
 * display on a track with no displays yet gets a bare LinearBasicDisplay ahead
 * of it, since the first declared display is the one a track opens as.
 * Idempotent: a re-run replaces the entry by its displayId.
 */
export function addColumnDisplay(track: Track): Track {
  const entry = entryFor(track)
  if (entry === undefined) {
    return track
  }
  const display = entry.display(track.trackId)
  const others = (Array.isArray(track.displays) ? track.displays : []).filter(
    d => !isRecord(d) || d.displayId !== display.displayId,
  )
  if (entry.position === 'first') {
    return { ...track, displays: [display, ...others] }
  }
  const before =
    others.length > 0
      ? others
      : [
          {
            type: 'LinearBasicDisplay',
            displayId: `${track.trackId}-LinearBasicDisplay`,
          },
        ]
  return { ...track, displays: [...before, display] }
}
