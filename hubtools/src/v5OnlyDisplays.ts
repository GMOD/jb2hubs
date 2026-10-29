import { isRecord } from './util.ts'

import type { JBrowseConfig, Track } from './types.ts'

// Opening a track whose `displays[]` names one of these on v4.3.0 (the stable
// Desktop, hosted `latest`) replaces the session with "Fatal error ... No
// matching type for union". v5 has all four. config.json leaves them out, so
// those tracks open on their plain display; config-staging.json keeps them,
// and a launch that needs one reads that sibling.
export const V5_ONLY_DISPLAY_TYPES = new Set([
  'LinearMultiRowFeatureDisplay',
  'LinearMarkDisplay',
  'LinearManhattanDisplay',
  'MultiWaySyntenyDisplay',
])

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

export function withoutV5OnlyDisplays<C extends JBrowseConfig>(config: C): C {
  return config.tracks
    ? { ...config, tracks: config.tracks.map(withoutV5OnlyTrackDisplays) }
    : config
}
