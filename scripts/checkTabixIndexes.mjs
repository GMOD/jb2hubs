#!/usr/bin/env node
//
// checkTabixIndexes.mjs
//
// Every bgzipped track file the pipelines derive is only usable with its tabix
// index beside it. This fails the deploy when one is missing.
//
// It exists because "the recipe ran" and "the thing it was supposed to produce
// exists" are the same question in make and two different questions in a shell
// pipeline. criGriChoV1's xenoRefGene is the shape: the 80MB gff.gz built fine,
// `tabix -C` refused it over one record (a u32 underflow in bed2gff, since
// fixed), run_for_assemblies_lenient warned and moved on, needs_rebuild's stamp
// was never written so every later run redid the same broken work -- and the
// config shipped naming a .csi that did not exist. Nothing asked whether the
// index got written, so it stayed broken until someone probed the urls.
//
// It is invisible to every other layer, which is the reason for a separate
// check rather than an extra assertion somewhere: check-plugin-urls looks at
// plugins, check-sidecar-urls at assembly sidecars, and check-config-compat
// hydrates a config whose broken track nothing opens perfectly cleanly.
//
// Presence only, deliberately. A fresh .gz against an OLDER index is the other
// shape worth fearing -- it is what the bucket held during the 2026-08-27 bgzip
// backend swap, and it reads as `invalid bgzf header` in production rather than
// as a missing file. But mtime cannot detect it here: measured over all 5,856
// UCSC files on 2026-08-28, 72 have an index whose mtime precedes the data by
// up to 0.05 seconds, which is bgzip and tabix finishing inside the same
// filesystem timestamp and not staleness at all. A tolerance large enough to
// absorb that would also absorb a genuinely stale index from a run seconds
// later, so the check would be a fudge factor pretending to be a guarantee.
// What actually defends that shape is assert_bgzip_toolchain (the cause) and
// rclone_sync_with_indexes' ordering (the exposure), both already in place.
//
// Usage:
//   node scripts/checkTabixIndexes.mjs [--dir DIR]... [--built-dir DIR]
//
// Exit 0 clean, 1 an index is missing, 2 the check could not run.
//
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { resolveBuiltDir } from './builtDir.mjs'

const { values } = parseArgs({
  options: {
    dir: { type: 'string', multiple: true },
    'built-dir': { type: 'string' },
  },
})

const root = path.join(import.meta.dirname, '..')

// Both pipelines derive bgzipped tracks, and both walks are local filesystem
// reads costing nothing -- unlike check-sidecar-urls and check-track-urls,
// GenArk is in scope here because there is no request budget to spend on it.
const GENARK_BGZ = path.join(root, 'genark2jbrowse/bgz')

const DATA_SUFFIXES = ['.bed.gz', '.gff.gz']
const INDEX_SUFFIXES = ['.csi', '.tbi']

// A directory holding a handful of files is a build that did not happen, or a
// path that moved. Reporting "no missing indexes" over it would be the same
// vacuous pass that prune_stray_configs and check-orphan-configs refuse to give.
const MIN_FILES = 500

// Paths outside the repo (the built tree lives on another mount) relativize to
// a wall of `../`, which is less readable than the absolute path it came from.
function display(file) {
  const rel = path.relative(root, file)
  return rel && !rel.startsWith('..') ? rel : file
}

function refuse(message) {
  console.error(`cannot check tabix indexes: ${message}`)
  process.exit(2)
}

function walk(dir, onFile) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, onFile)
    } else if (entry.isFile()) {
      onFile(full)
    }
  }
}

const roots = []
if (values.dir) {
  for (const dir of values.dir) {
    if (!fs.existsSync(dir)) {
      refuse(`${dir} does not exist`)
    }
    roots.push(dir)
  }
} else {
  const builtDir = resolveBuiltDir(values['built-dir'])
  if (builtDir && !fs.existsSync(builtDir)) {
    refuse(`${builtDir} does not exist`)
  }
  if (builtDir) {
    roots.push(builtDir)
  }
  if (fs.existsSync(GENARK_BGZ)) {
    roots.push(GENARK_BGZ)
  }
}

if (roots.length === 0) {
  refuse(
    'no tree to walk. Pass --dir, or set UCSC_BUILT_DIR, or run on the build machine.',
  )
}

let total = 0
const missing = []
for (const dir of roots) {
  let inThisRoot = 0
  walk(dir, full => {
    if (DATA_SUFFIXES.some(s => full.endsWith(s))) {
      inThisRoot++
      if (!INDEX_SUFFIXES.some(s => fs.existsSync(full + s))) {
        missing.push(full)
      }
    }
  })
  console.log(`${display(dir)}: ${inThisRoot} bgzipped track file(s)`)
  total += inThisRoot
}

if (total < MIN_FILES) {
  refuse(
    `only ${total} bgzipped track file(s) across ${roots.length} tree(s), below the ` +
      `${MIN_FILES} floor. That is a tree that was not built, not a corpus with no ` +
      `missing indexes in it.`,
  )
}

if (missing.length > 0) {
  for (const file of missing) {
    console.log(`  FAIL  ${display(file)}`)
  }
  console.error(
    `\n${missing.length} of ${total} bgzipped track file(s) have no .csi or .tbi beside them. ` +
      `Each one is referenced by a config that would ship naming an index our bucket does ` +
      `not have, and the derivation that produced it left no rebuild stamp, so no later ` +
      `run retries it on its own. Delete the .gz to force a rebuild, and check why tabix ` +
      `refused it.`,
  )
  process.exit(1)
}
console.log(`\nAll ${total} bgzipped track files have a tabix index.`)
