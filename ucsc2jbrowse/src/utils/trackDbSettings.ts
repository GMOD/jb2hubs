import { splitOnFirst } from 'hubtools'

/**
 * A trackDb entry's `settings` blob as a key -> value record: one setting per
 * line, the key running up to the first space, blank lines dropped.
 *
 * Three modules had their own copy of this loop (the big-file walk, the
 * multiWig folder and the metadata step), two of them reaching the same shape
 * through a cast.
 */
export function parseTrackDbSettings(settings: string): Record<string, string> {
  return Object.fromEntries(
    settings
      .split('\n')
      .map(line => splitOnFirst(line, ' '))
      .filter(([key]) => !!key),
  )
}

/** `parent <track> [on|off]` -> `<track>`, or undefined when there is none. */
export function parentTrackName(settings: Record<string, string>) {
  return settings.parent ? splitOnFirst(settings.parent, ' ')[0] : undefined
}
