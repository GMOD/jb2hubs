#!/usr/bin/env node
/* eslint-disable no-console */
//
// checkDisplayTypes.mjs
//
// Every display type our shipped configs name, and whether the oldest supported
// JBrowse release has it.
//
// This is the one config-content change that is fatal rather than degraded. An
// unknown track type or adapter costs that one track on an old host; a
// `displays[]` entry naming a type the host lacks fails the track config's MST
// union, and the app renders "Fatal error ... [mobx-state-tree] No matching type
// for union" the moment someone opens the track. See CLAUDE.md, "Old JBrowse
// versions read these configs".
//
// checkConfigCompat.mjs cannot catch it — the fatal needs the track OPENED, and
// a track nothing opens hydrates clean. So the question has to be answered
// statically, from the config side, which is what this does.
//
// SCOPE, because it is easy to over-trust: it reads `tracks[].displays[].type`.
// If a config ever names a display type somewhere else that participates in the
// same union, this will not see it.
//
// It does NOT resolve the release side for you — printing the vocabulary is the
// part that has to be re-derived from the tree. To finish the check against a
// jbrowse-components checkout:
//
//   git ls-remote --tags origin | grep -o 'v[0-9.]*$' | sort -V | tail -1
//   git ls-tree -r --name-only <that-tag> | grep /<DisplayType>/
//
// `ls-remote`, not local tags: a checkout that has not fetched in a while
// answers "no release yet" indefinitely.
//
// Usage:
//   node scripts/checkDisplayTypes.mjs
//   node scripts/checkDisplayTypes.mjs --json report.json
//
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: { json: { type: 'string' } },
})

// Both arms. UCSC ships one config per assembly; GenArk shards thousands under
// hubs/. Staging siblings are included deliberately — they are shipped files
// too, just linked from a different site, and a type that appears ONLY in a
// staging sibling is exactly the gated case worth seeing separately.
const ROOTS = [
  { arm: 'ucsc', dir: 'ucsc2jbrowse/configs' },
  { arm: 'genark', dir: 'hubs' },
]

const counts = new Map()
let files = 0

function note(arm, type, file) {
  const e = counts.get(type) ?? { ucsc: 0, genark: 0, staging: 0, example: '' }
  e[arm]++
  if (file.endsWith('-staging.json')) {
    e.staging++
  }
  e.example ||= file
  counts.set(type, e)
}

function walk(arm, dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(arm, p)
    } else if (entry.name.endsWith('.json')) {
      let config
      try {
        config = JSON.parse(fs.readFileSync(p, 'utf8'))
      } catch {
        // not every .json under these trees is a config
        continue
      }
      if (!Array.isArray(config.tracks)) {
        continue
      }
      files++
      for (const track of config.tracks) {
        for (const display of track.displays ?? []) {
          if (display?.type) {
            note(arm, display.type, p)
          }
        }
      }
    }
  }
}

for (const { arm, dir } of ROOTS) {
  walk(arm, dir)
}

const rows = [...counts]
  .map(([type, n]) => ({ type, ...n }))
  .sort((a, b) => a.type.localeCompare(b.type))

console.log(`${files} config file(s) scanned, ${rows.length} display type(s)\n`)
for (const r of rows) {
  const staged = r.staging ? `  (${r.staging} in staging siblings)` : ''
  console.log(
    `  ${r.type}\n    ucsc=${r.ucsc} genark=${r.genark}${staged}\n    e.g. ${r.example}`,
  )
}
console.log(
  "\nEach type above must exist in the oldest release in checkConfigCompat.mjs's\nHOST_VERSIONS. Resolve that against a jbrowse-components checkout — see the\nheader of this file for the two commands.",
)

if (values.json) {
  fs.writeFileSync(values.json, JSON.stringify({ files, types: rows }, null, 2))
  console.log(`\nwrote ${values.json}`)
}
