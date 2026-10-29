import { isRecord } from './util.ts'

import type { JBrowseConfig, Track } from './types.ts'

// Opening a track that names one of these on v4.3.0 (the stable Desktop,
// hosted `latest`) replaces the session with "Fatal error ... No matching type
// for union"; v5 has them all. config.json leaves them out: a track loses the
// display and opens on its plain one, and a track with the adapter is dropped.
// config-staging.json keeps both, and a launch that needs one reads it.
export const V5_ONLY_DISPLAY_TYPES = new Set([
  'LinearMultiRowFeatureDisplay',
  'LinearMarkDisplay',
  'LinearManhattanDisplay',
  'MultiWaySyntenyDisplay',
])

export const V5_ONLY_ADAPTER_TYPES = new Set(['MultiPairwiseSyntenyAdapter'])

// Every adapter type a track names, its sub-adapters' included
export function adapterTypes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(adapterTypes)
  }
  if (!isRecord(value)) {
    return []
  }
  const own =
    typeof value.type === 'string' && value.type.endsWith('Adapter')
      ? [value.type]
      : []
  return [...own, ...Object.values(value).flatMap(adapterTypes)]
}

function withoutV5OnlyTrackDisplays<T extends Track>(track: T): T {
  if (!Array.isArray(track.displays)) {
    return track
  }
  const displays = track.displays.filter(
    d => !(isRecord(d) && V5_ONLY_DISPLAY_TYPES.has(String(d.type))),
  )
  if (displays.length === track.displays.length) {
    return track
  }
  const { displays: _dropped, ...rest } = track
  return (displays.length > 0 ? { ...rest, displays } : rest) as T
}

export function withoutV5Only<C extends JBrowseConfig>(config: C): C {
  return config.tracks
    ? {
        ...config,
        tracks: config.tracks
          .filter(
            t =>
              !adapterTypes(t.adapter).some(a => V5_ONLY_ADAPTER_TYPES.has(a)),
          )
          .map(withoutV5OnlyTrackDisplays),
      }
    : config
}
