import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

/**
 * Some UCSC big* tracks name no `bigDataUrl` in trackDb. Their file lives in a
 * one-column golden-path table instead: `<table>.txt.gz` holds a single
 * `/gbdb/...` path, and the trackDb entry points at it with a `table` setting
 * (which is often a different name than the track's own).
 *
 * This is how the legacy ENCODE regulation composites are stored ("Layered
 * H3K27Ac" and friends), which on hg19 are the only regulation signal tracks
 * UCSC ships at all: hg19 has no ENCODE 4 organ averages. Without resolving
 * these, a whole class of tracks silently never converts.
 *
 * The tables are already on disk, since the pipeline rsyncs the entire
 * `goldenPath/<db>/database` directory, so this is a local read per track.
 */
export type TableFileResolver = (table: string) => string | undefined

// A table whose rows are per-sequence (a split bbi) has more than one distinct
// path and can't become one adapter, so it resolves to nothing rather than to an
// arbitrary row.
function singleGbdbPath(text: string) {
  const paths = new Set(
    text
      .split('\n')
      .filter(Boolean)
      .map(line => line.split('\t').find(f => f.startsWith('/gbdb/')))
      .filter((f): f is string => !!f),
  )
  return paths.size === 1 ? [...paths][0] : undefined
}

/**
 * Resolve `table` to the absolute URL of its big* file, or undefined when the
 * table is absent, holds no `/gbdb/` path, or is split across sequences.
 * Results are memoized: sibling subtracks of a composite are resolved in one
 * pass, and a missing table is only stat'd once.
 */
export function makeTableFileResolver({
  dbDir,
  baseUrl,
}: {
  dbDir: string
  baseUrl: string
}): TableFileResolver {
  const cache = new Map<string, string | undefined>()
  return (table: string) => {
    if (!cache.has(table)) {
      const file = path.join(dbDir, `${table}.txt.gz`)
      let resolved: string | undefined
      try {
        const text = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8')
        const gbdbPath = singleGbdbPath(text)
        resolved = gbdbPath ? `${baseUrl}${gbdbPath}` : undefined
      } catch (e) {
        resolved = undefined
      }
      cache.set(table, resolved)
    }
    return cache.get(table)
  }
}

// Used when no database directory is available (hub-derived assemblies), so
// callers don't branch on whether resolution is possible.
export const noTableFiles: TableFileResolver = () => undefined
