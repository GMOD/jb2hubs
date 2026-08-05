#!/usr/bin/env node
//
// checkSidecarUrls.mjs
//
// Every assembly sidecar the UCSC configs name -- chromSizes, refNameAliases,
// cytobands -- checked before the configs ship.
//
// These deserve the same treatment as plugins[].url and for the same reason:
// they are the other field that kills a whole session rather than one track.
// assembly.loadPre() fetches the sequence regions, refNameAliases, cytobands
// and genetic codes in one Promise.all, and any single rejection fails the
// entire assembly. A dead sidecar url is not "this assembly is missing its
// aliases", it is "this assembly does not open".
//
// This exists because that went unnoticed: mpxvRivers named a chromAlias.txt
// that 404s and was unopenable in production, invisible to every layer we had.
// checkPluginUrls.mjs only looks at plugins; checkConfigCompat.mjs keys on
// fatal page errors, plugin globals and track count, and a failed assembly
// trips none of those (ADR 0003 says so explicitly).
//
// SCOPE: UCSC only. The GenArk configs name ~101k upstream sidecar urls, and
// hgdownload drops connections when probed in bulk -- checking them is the road
// straight back to the mirroring sweep that was reverted on 2026-08-05.
//
// Two kinds of reference, two kinds of check:
//   relative -- ours, mirrored next to the config. Must exist on disk in the
//               built dir, or we are about to publish a config naming a file
//               that will 404 from our own bucket.
//   absolute -- upstream's, must be reachable. mirrorAssemblySidecars.ts drops
//               a node whose url 404s, so one surviving here means the drop did
//               not run, or upstream broke after it did.
//
// Usage:
//   node scripts/checkSidecarUrls.mjs [--built-dir DIR] [--json report.json]
//
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    'built-dir': { type: 'string' },
    json: { type: 'string' },
  },
})

const builtDir =
  values['built-dir'] ??
  process.env.UCSC_BUILT_DIR ??
  '/mnt/sdb/cdiesh/jb2hubs/ucscBuilt'

if (!fs.existsSync(builtDir)) {
  console.error(
    `built dir ${builtDir} does not exist; pass --built-dir or set UCSC_BUILT_DIR`,
  )
  process.exit(1)
}

// Kept in sync with `is_assembly_db` in ucsc2jbrowse/common.sh, the source of
// truth every "process all assemblies" pass already uses. hgFixed is a shared
// metadata database; cb1 is a retired assembly UCSC still lists, whose 2bit
// 404s along with its chrom.sizes -- so its config is dead at the sequence
// adapter, which no sidecar decision can fix. Skipped rather than allowlisted
// silently: they are reported below.
const NOT_ASSEMBLIES = new Set(['hgFixed', 'cb1'])

const isRemote = value =>
  value.startsWith('http://') || value.startsWith('https://')

// Same three fields mirrorSidecars.ts walks, in the same order. chromSizes is a
// bare string on the TwoBitAdapter; the other two are `uri` on their adapters.
function sidecarsOf(assembly) {
  const out = []
  const chromSizes = assembly.sequence?.adapter?.chromSizes
  if (typeof chromSizes === 'string') {
    out.push({ label: 'chromSizes', value: chromSizes })
  }
  for (const key of ['refNameAliases', 'cytobands']) {
    const uri = assembly[key]?.adapter?.uri
    if (typeof uri === 'string') {
      out.push({ label: key, value: uri })
    }
  }
  return out
}

const refs = []
const skipped = []
for (const entry of fs.readdirSync(builtDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue
  }
  if (NOT_ASSEMBLIES.has(entry.name)) {
    skipped.push(entry.name)
    continue
  }
  const dir = path.join(builtDir, entry.name)
  const configPath = path.join(dir, 'config.json')
  if (!fs.existsSync(configPath)) {
    continue
  }
  let config
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (e) {
    refs.push({
      db: entry.name,
      label: 'config.json',
      value: configPath,
      problem: `unparseable: ${e}`,
    })
    continue
  }
  for (const assembly of config.assemblies ?? []) {
    for (const sidecar of sidecarsOf(assembly)) {
      refs.push({ db: entry.name, dir, ...sidecar })
    }
  }
}

// Local checks first: no network, and they are the ones that catch a config
// about to name a file our own bucket does not have.
for (const ref of refs) {
  if (ref.problem || isRemote(ref.value)) {
    continue
  }
  const file = path.join(ref.dir, ref.value)
  if (!fs.existsSync(file)) {
    ref.problem = `relative sidecar not on disk: ${ref.value}`
  } else if (fs.statSync(file).size === 0) {
    ref.problem = `relative sidecar is empty: ${ref.value}`
  }
}

// hgdownload drops connections under bursts, and the remotes left here should
// be a handful, so keep this sequential rather than clever.
const remotes = refs.filter(ref => !ref.problem && isRemote(ref.value))
for (const ref of remotes) {
  try {
    const res = await fetch(ref.value, {
      method: 'HEAD',
      signal: AbortSignal.timeout(30_000),
    })
    ref.status = res.status
    if (!res.ok) {
      ref.problem = `HTTP ${res.status}`
    }
  } catch (e) {
    ref.problem = `fetch failed: ${e}`
  }
}

const broken = refs.filter(ref => ref.problem)
const localCount = refs.length - remotes.length

console.log(
  `checked ${refs.length} sidecar refs across ${new Set(refs.map(r => r.db)).size} assemblies ` +
    `(${localCount} mirrored locally, ${remotes.length} still upstream)`,
)
if (skipped.length > 0) {
  console.log(`skipped ${skipped.join(', ')} (not assemblies; is_assembly_db)`)
}
for (const ref of broken) {
  console.log(
    `  FAIL  ${ref.db.padEnd(16)} ${ref.label.padEnd(15)} ${ref.problem}`,
  )
  console.log(`        ${ref.value}`)
}

if (values.json) {
  fs.writeFileSync(values.json, JSON.stringify({ refs }, null, 2))
}

if (broken.length > 0) {
  console.error(
    `\n${broken.length} sidecar ref(s) are broken. Each one fails its whole ` +
      `assembly, not just the file: loadPre() rejects as a unit.`,
  )
  process.exit(1)
}
console.log('\nEvery assembly sidecar resolves.')
