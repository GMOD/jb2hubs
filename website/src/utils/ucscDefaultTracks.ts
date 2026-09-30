import fs from 'fs'
import path from 'path'

interface MinimalConfig {
  defaultSession?: { views?: { init?: { tracks?: string[] } }[] }
}

// Each hosted UCSC db's defaultSession tracks, read off its minimal.json
// (committed as ucsc2jbrowse/configs-minimal/<db>.json, ~16KB each against
// hg38's 30MB config.json), which carries the same defaultSession. A db without
// one is left out, so /ucsc/launch/ sends it to UCSC rather than to a config
// it cannot vouch for.
export function ucscDefaultTracks() {
  const { ucscGenomes } = JSON.parse(
    fs.readFileSync(path.join('src', 'list.json'), 'utf-8'),
  ) as { ucscGenomes: Record<string, unknown> }
  const dir = path.join('..', 'ucsc2jbrowse', 'configs-minimal')
  return Object.fromEntries(
    Object.keys(ucscGenomes).flatMap(db => {
      const file = path.join(dir, `${db}.json`)
      if (!fs.existsSync(file)) {
        return []
      }
      const config = JSON.parse(fs.readFileSync(file, 'utf-8')) as MinimalConfig
      return [[db, config.defaultSession?.views?.[0]?.init?.tracks ?? []]]
    }),
  )
}
