// Displays that draw a column the derived LinearBasicDisplay only lists in a
// feature's details: gnomAD's allele frequency and the GWAS Catalog's p-value.
// Spelled as jbrowse-components main spells them, for v5.0.0-beta.18
// (agent-docs/todo/write-mains-spellings-at-beta18.md).
//
// GTEx's eQTLs split by `tissue` (LinearMultiRowFeatureDisplay) drew every row
// in the default blue, not the tissue colors in their itemRgb, with 45 rows too
// thin to label at the default height (main, 2026-10-26), so they stay packed.
import { isRecord } from './util.ts'

import type { Track } from './types.ts'

const ANNOT_COLORS = {
  pLoF: '#d62728',
  missense: '#ff7f0e',
  synonymous: '#2ca02c',
  other: '#9e9e9e',
}

// A bigBed column is a string, and an AF of 0 has no place on a log axis
const GNOMAD_AF = 'jexl:parseFloat(feature.AF)'

function gnomadAfDisplay(trackId: string) {
  return {
    type: 'LinearMarkDisplay',
    displayId: `${trackId}-LinearMarkDisplay`,
    height: 200,
    filter: [`${GNOMAD_AF} > 0`],
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
          y: GNOMAD_AF,
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
        encoding: { y: 'jexl:-log10(parseFloat(feature.pValue))', size: 5 },
      },
    ],
  }
}

const BY_TABLE: Record<
  string,
  { adapter: string; display: (trackId: string) => Record<string, unknown> }
> = {
  gnomadGenomesVariantsV4_1: {
    adapter: 'BigBedAdapter',
    display: gnomadAfDisplay,
  },
  gnomadExomesVariantsV4_1: {
    adapter: 'BigBedAdapter',
    display: gnomadAfDisplay,
  },
  gwasCatalog: { adapter: 'BedTabixAdapter', display: gwasManhattanDisplay },
}

function columnDisplay(track: Track) {
  const table = track.trackId.slice(track.trackId.indexOf('-') + 1)
  const entry = Object.hasOwn(BY_TABLE, table) ? BY_TABLE[table] : undefined
  return entry &&
    track.type === 'FeatureTrack' &&
    isRecord(track.adapter) &&
    track.adapter.type === entry.adapter
    ? entry.display(track.trackId)
    : undefined
}

/**
 * Put the column display first, so the track opens as it, ahead of the derived
 * LinearBasicDisplay, which stays one menu click away. Idempotent: a re-run
 * replaces the entry by its displayId.
 */
export function addColumnDisplay(track: Track): Track {
  const display = columnDisplay(track)
  if (display === undefined) {
    return track
  }
  const others = (Array.isArray(track.displays) ? track.displays : []).filter(
    d => !isRecord(d) || d.displayId !== display.displayId,
  )
  return { ...track, displays: [display, ...others] }
}
