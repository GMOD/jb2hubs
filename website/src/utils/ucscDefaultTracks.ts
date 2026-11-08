import fs from 'fs'
import path from 'path'

import {
  checked,
  isArrayOf,
  isOptional,
  isShape,
  isStringArray,
} from 'hubtools/guards'

import { readUcscGenomes } from './hubListings.ts'

import type { Guard } from 'hubtools/guards'

interface MinimalConfig {
  defaultSession?: { views?: { init?: { tracks?: string[] } }[] }
}

const isMinimalConfig: Guard<MinimalConfig> = isShape({
  defaultSession: isOptional(
    isShape({
      views: isOptional(
        isArrayOf(
          isShape({
            init: isOptional(isShape({ tracks: isOptional(isStringArray) })),
          }),
        ),
      ),
    }),
  ),
})

// Each hosted UCSC db's defaultSession tracks, read off its minimal.json
// (committed as ucsc2jbrowse/configs-minimal/<db>.json, ~16KB each against
// hg38's 30MB config.json), which carries the same defaultSession. A db without
// one is left out, so /ucsc/launch/ sends it to UCSC rather than to a config
// it cannot vouch for.
export function ucscDefaultTracks() {
  const dir = path.join('..', 'ucsc2jbrowse', 'configs-minimal')
  return Object.fromEntries(
    Object.keys(readUcscGenomes()).flatMap(db => {
      const file = path.join(dir, `${db}.json`)
      if (!fs.existsSync(file)) {
        return []
      }
      const config = checked(
        JSON.parse(fs.readFileSync(file, 'utf-8')),
        isMinimalConfig,
        file,
      )
      return [[db, config.defaultSession?.views?.[0]?.init?.tracks ?? []]]
    }),
  )
}
