import { isArray, isRecord } from './guards.ts'

import type { Track } from './types.ts'

// The paths each deriver owns, and therefore the paths a re-run re-derives:
// dropped from an existing entry before the fresh entry merges into it, so a
// trackDb setting that goes away takes its config with it. Everything else on
// that entry is left alone, `encoding`'s other channels included.
type DerivedPath = readonly string[]
export const FEATURE_DERIVED_PATHS: DerivedPath[] = [['labels'], ['tooltip']]
export const WIGGLE_DERIVED_PATHS: DerivedPath[] = [
  ['encoding', 'y', 'field'],
  ['encoding', 'y', 'scale'],
  ['mark', 'extent'],
  ['extent'],
]
export const DISPLAY_DEFAULTS_DERIVED_PATHS: DerivedPath[] = [
  ['encoding', 'color'],
  ['filter'],
]

function without(
  entry: Record<string, unknown>,
  [key, ...rest]: DerivedPath,
): Record<string, unknown> {
  if (key === undefined) {
    return entry
  }
  const child = entry[key]
  const kept = rest.length > 0 && isRecord(child) ? without(child, rest) : child
  const dropped =
    rest.length === 0 || (isRecord(kept) && Object.keys(kept).length === 0)
  return Object.fromEntries(
    Object.entries(entry).flatMap(([k, v]) =>
      k !== key ? [[k, v]] : dropped ? [] : [[k, kept]],
    ),
  )
}

function merged(
  base: Record<string, unknown>,
  over: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries([
    ...Object.entries(base),
    ...Object.entries(over).map(([key, value]): [string, unknown] => {
      const under = base[key]
      return [
        key,
        isRecord(under) && isRecord(value) ? merged(under, value) : value,
      ]
    }),
  ])
}

// Refreshes the entry a deriver wrote on an earlier run, matched by the
// displayId it gives itself, and leaves a hand-authored display alone. The
// staging pass and the mouse-strain builder re-run over their own output, and a
// skip there would keep a track from ever earning a second derived setting.
export function withDerivedDisplay(
  track: Track,
  derived: { displayId: string } | undefined,
  derivedPaths: DerivedPath[],
): Track {
  if (derived === undefined) {
    return track
  }
  if (track.displays === undefined) {
    return { ...track, displays: [derived] }
  }
  return isArray(track.displays)
    ? {
        ...track,
        displays: track.displays.map(d =>
          isRecord(d) && d.displayId === derived.displayId
            ? merged(derivedPaths.reduce(without, d), derived)
            : d,
        ),
      }
    : track
}

// Earlier runs wrote these paths on the basic entry, and the mouse-strain
// builder re-runs over such a config, so they move from there. A track whose
// displays were all written by hand is left alone, as withDerivedDisplay does.
export function withDerivedDisplayDefaults(
  track: Track,
  derived: Record<string, unknown>,
  derivedPaths: DerivedPath[],
): Track {
  const basicId = `${track.trackId}-LinearBasicDisplay`
  const { displays, displayDefaults } = track
  return isArray(displays) &&
    !displays.some(d => isRecord(d) && d.displayId === basicId)
    ? track
    : {
        ...track,
        ...(isArray(displays)
          ? {
              displays: displays.map(d =>
                isRecord(d) && d.displayId === basicId
                  ? derivedPaths.reduce(without, d)
                  : d,
              ),
            }
          : {}),
        displayDefaults: merged(
          derivedPaths.reduce(
            without,
            isRecord(displayDefaults) ? displayDefaults : {},
          ),
          derived,
        ),
      }
}
