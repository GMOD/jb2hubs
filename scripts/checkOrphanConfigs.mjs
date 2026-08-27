#!/usr/bin/env node
//
// checkOrphanConfigs.mjs
//
// Every file in ucsc2jbrowse/configs/ and configs-minimal/ has to be a db the
// UCSC genome list names. This fails the deploy when one is not.
//
// `configs/` is an append-only mirror: make.sh copies
// $UCSC_BUILT_DIR/<db>/config.json in, and nothing took one out until the prune
// in common.sh. That is how `ucscRenames/hg38.json` -- a trackId -> new-name map
// with `assemblies: [{}]` -- was swept up, processed as a config, mirrored as
// `configs/renames.json`, and fed four frozen unpkg.com plugin urls into
// all.json for a year. Deleting the file fixed the symptom twice; it came back
// both times.
//
// Two halves, and the split is the point:
//
//   make.sh prunes what it can PROVE is junk -- absent from the genome list AND
//   carrying no assemblies[0].name. No judgement, so no reason to ask.
//
//   This fails on the rest: a real, named config whose db the genome list no
//   longer has. Retiring one is a human decision (published links and desktop
//   installs keep naming these urls), so it stops the upload and says so rather
//   than deleting quietly.
//
// checkPluginUrls.mjs already rejects a file in these directories that is not an
// assembly config at all. The question here is the other one: a perfectly valid
// config filed under a name UCSC does not serve.
//
// Usage:
//   node scripts/checkOrphanConfigs.mjs [--list list.json] [--built-dir DIR]
//
// Exit 0 clean, 1 an orphan is present, 2 the check could not run.
//
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { resolveBuiltDir } from './builtDir.mjs'

const { values } = parseArgs({
  options: {
    list: { type: 'string' },
    'built-dir': { type: 'string' },
  },
})

const root = path.join(import.meta.dirname, '..')
const CONFIG_DIRS = ['ucsc2jbrowse/configs', 'ucsc2jbrowse/configs-minimal']

// hgFixed is rsynced deliberately and never appears in the genome list.
const EXTRA_NAMES = ['hgFixed']

// A truncated genome list would make every config it omits an orphan and fail
// the deploy over nothing. UCSC lists 238 and this check has no business
// running on a fraction of that.
const MIN_GENOMES = 100

function refuse(message) {
  console.error(`cannot check for orphaned configs: ${message}`)
  process.exit(2)
}

// Strongest first. The built tree's list.json is what make.sh just copied from,
// so it is the exact set the working tree should mirror. website/src/list.json
// is make.sh's committed copy of the same file, which is what makes this
// runnable in CI and in a checkout with no built tree at all -- the case that
// must never be mistaken for "every config is an orphan".
function readGenomeNames() {
  const builtDir = resolveBuiltDir(values['built-dir'])
  const candidates = [
    values.list,
    builtDir && path.join(builtDir, 'list.json'),
    path.join(root, 'website/src/list.json'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue
    }
    let names
    try {
      names = Object.keys(
        JSON.parse(fs.readFileSync(candidate, 'utf8')).ucscGenomes ?? {},
      )
    } catch (e) {
      refuse(`${candidate} is not a readable genome list (${e})`)
    }
    if (names.length < MIN_GENOMES) {
      refuse(
        `${candidate} names ${names.length} genomes, below the ${MIN_GENOMES} floor. ` +
          `Treating that as the truth would report most of the corpus as orphaned.`,
      )
    }
    return { source: candidate, names }
  }
  refuse(
    `no genome list found. Pass --list, or set UCSC_BUILT_DIR, or run from a ` +
      `checkout that has website/src/list.json.`,
  )
}

const { source, names } = readGenomeNames()
const expected = new Set([...names, ...EXTRA_NAMES])

const contents = new Map()
for (const dir of CONFIG_DIRS) {
  const full = path.join(root, dir)
  if (!fs.existsSync(full)) {
    refuse(`${dir} does not exist`)
  }
  const files = fs
    .readdirSync(full)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace(/\.json$/, ''))
  // An empty directory is a build that did not happen, not a corpus with no
  // orphans in it.
  if (files.length === 0) {
    refuse(`${dir} holds no configs`)
  }
  contents.set(dir, files)
}

console.log(
  `genome list: ${path.relative(root, source)} (${names.length} genomes + ${EXTRA_NAMES.join(', ')})`,
)

const orphans = []
for (const [dir, files] of contents) {
  console.log(`${dir}: ${files.length} configs`)
  for (const name of files) {
    if (!expected.has(name)) {
      orphans.push(`${dir}/${name}.json`)
    }
  }
}

// The two directories are published as a pair -- transformGenomeList names the
// minimal one as `jbrowseMinimalConfig` for every db -- so a name in one and not
// the other is a broken reference or a leftover. Reported rather than fatal:
// the failure this check exists to stop is an orphan, and one of these is
// usually the same orphan seen from the other side.
const [configNames, minimalNames] = CONFIG_DIRS.map(
  d => new Set(contents.get(d)),
)
const onlyConfig = [...configNames].filter(n => !minimalNames.has(n))
const onlyMinimal = [...minimalNames].filter(n => !configNames.has(n))
if (onlyConfig.length > 0) {
  console.log(`note: no minimal.json mirror for: ${onlyConfig.join(', ')}`)
}
if (onlyMinimal.length > 0) {
  console.log(
    `note: a minimal config with no config.json mirror: ${onlyMinimal.join(', ')}`,
  )
}

if (orphans.length > 0) {
  for (const orphan of orphans) {
    console.log(`  FAIL  ${orphan}`)
  }
  console.error(
    `\n${orphans.length} orphaned config file(s): the UCSC genome list has no such db. ` +
      `Each one is published and merged into all.json anyway. Delete it if the db ` +
      `really disappeared upstream; that call is deliberately left to a human.`,
  )
  process.exit(1)
}
console.log('\nEvery config names a db the UCSC genome list has.')
