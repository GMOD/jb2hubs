import { jbrowseUrl, ucscConfigPath } from '../config/jbrowse.ts'

// hgTracks' visibility values; any other `<track>=<value>` in its query is a
// setting, not a request to show the track.
const VISIBILITIES = new Set(['dense', 'squish', 'pack', 'full', 'show'])

/**
 * Where /ucsc/launch/ sends a UCSC `hgTracks` query
 * (`?db=mm39&position=chr11:69471173-69482698&ncbiOrtho=pack`): our config for
 * that db at that position, opening its defaultSession's tracks plus every
 * track the query shows, or UCSC's own browser for a db we do not host.
 *
 * `defaultTracks` maps each hosted db to its defaultSession's tracks. The URL's
 * `tracks` replaces the defaultSession's rather than adding to it, so leaving
 * them out would open the ortholog on a browser with no gene track.
 */
export function ucscLaunchUrl(
  search: string,
  defaultTracks: Record<string, string[]>,
) {
  const params = new URLSearchParams(search)
  const db = params.get('db') ?? ''
  const base = Object.hasOwn(defaultTracks, db) ? defaultTracks[db] : undefined
  if (base === undefined) {
    return `https://genome.ucsc.edu/cgi-bin/hgTracks?${params}`
  }
  const shown = [...params]
    .filter(([key, value]) => key !== 'db' && VISIBILITIES.has(value))
    .map(([key]) => `${db}-${key}`)
  const tracks = [...new Set([...base, ...shown])]
  const position = params.get('position')
  return [
    jbrowseUrl(ucscConfigPath(db)),
    `assembly=${encodeURIComponent(db)}`,
    ...(position ? [`loc=${encodeURIComponent(position)}`] : []),
    ...(tracks.length > 0
      ? [`tracks=${tracks.map(t => encodeURIComponent(t)).join(',')}`]
      : []),
  ].join('&')
}
