import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { isRecord } from './util.ts'

import type { Track } from './types.ts'

// What decides a trix index's bytes besides the files it reads: each track's
// indexing policy, the run's --attributes for a track without one, and the
// text-indexing-core the pinned CLI loads (5.0.0-beta.19 moved a value every
// transcript repeats onto its gene under an unchanged policy). An index whose
// recorded stamp differs is rebuilt, as one older than its GFF is.
//
// textIndex.sh writes the stamp to trix/indexed.hash after `jbrowse
// text-index` succeeds; both upload scripts exclude `*.hash`.
export const TEXT_INDEX_STAMP_FILE = 'indexed.hash'

const POLICY_KEYS = [
  'indexingAttributes',
  'indexingFeatureTypesToExclude',
  'indexingFeatureTypesToInclude',
]

export function textIndexerVersion() {
  const cli = createRequire(import.meta.url).resolve('@jbrowse/cli/package.json')
  const entry = createRequire(cli).resolve('@jbrowse/text-indexing-core')
  const manifest = path.join(path.dirname(entry), '..', 'package.json')
  const parsed: unknown = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  const version =
    isRecord(parsed) && parsed.name === '@jbrowse/text-indexing-core'
      ? parsed.version
      : undefined
  if (typeof version === 'string') {
    return version
  }
  throw new Error(
    `${manifest} is not @jbrowse/text-indexing-core's manifest; the CLI's layout changed`,
  )
}

export function textIndexStamp(
  indexer: string,
  tracks: Track[],
  runAttributes?: string[],
) {
  const policies = tracks.map(track => {
    const searching = isRecord(track.textSearching) ? track.textSearching : {}
    return [track.trackId, ...POLICY_KEYS.map(key => searching[key])]
  })
  const digest = createHash('sha256')
    .update(JSON.stringify({ runAttributes, policies }))
    .digest('hex')
    .slice(0, 16)
  return `text-indexing-core@${indexer}+${digest}`
}

export function recordedTextIndexStamp(trixDir: string) {
  const file = path.join(trixDir, TEXT_INDEX_STAMP_FILE)
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : undefined
}
