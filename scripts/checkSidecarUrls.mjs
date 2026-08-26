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

import { DEFAULT_BUILT_DIR, resolveBuiltDir } from './builtDir.mjs'

const { values } = parseArgs({
  options: {
    'built-dir': { type: 'string' },
    json: { type: 'string' },
  },
})

// Nothing here can be checked without the built tree, so fall back to naming
// the default in the error below rather than to a vaguer one.
const builtDir = resolveBuiltDir(values['built-dir']) ?? DEFAULT_BUILT_DIR

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

// The assemblies we promise stay open when hgdownload does not.
//
// Reachability is NOT that promise, and the checks below only prove
// reachability: a config that regressed to naming
// hgdownload.soe.ucsc.edu/…/hg38.chrom.sizes passes every one of them while UCSC
// is up, and the outage protection is silently gone. Mirroring is applied by one
// step in finalizeConfigs.ts; if that step throws, gets dropped from STEPS, or
// simply finds nothing to do, nothing else notices.
//
// So these have to be LOCAL, not merely fetchable. loadPre() resolves the
// sequence regions, refNameAliases and cytobands in one Promise.all, so a single
// upstream url among them is the difference between "the sequence track is
// broken" and "hg38 does not open".
//
// A named set rather than every assembly, deliberately: a sidecar whose fetch
// failed is left pointing upstream on purpose and retried next run, so making
// that fatal everywhere would turn one obscure assembly's transient blip into a
// blocked deploy. Everything outside this set is reported instead.
const MUST_BE_LOCAL = new Set(['hg38', 'hg19', 'mm39', 'mm10', 'hs1'])

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

// A reachable upstream url is fine for most assemblies and a regression for the
// flagship ones — see MUST_BE_LOCAL. Flagged after the fetches so a ref that is
// both remote AND dead still reports the more urgent problem.
for (const ref of refs) {
  if (!ref.problem && isRemote(ref.value) && MUST_BE_LOCAL.has(ref.db)) {
    ref.problem =
      `${ref.db} must serve this from our own bucket, but it names upstream. ` +
      `It is reachable now, so this is not an outage — it means mirroring did ` +
      `not run. During an hgdownload outage ${ref.db} would not open at all.`
  }
}

const broken = refs.filter(ref => ref.problem)
const localCount = refs.length - remotes.length

// Drift outside the enforced set: not fatal (these retry next run), but silence
// here is how a slow slide back to upstream would go unnoticed.
const remoteElsewhere = remotes.filter(
  ref => !MUST_BE_LOCAL.has(ref.db) && !ref.problem,
)

console.log(
  `checked ${refs.length} sidecar refs across ${new Set(refs.map(r => r.db)).size} assemblies ` +
    `(${localCount} mirrored locally, ${remotes.length} still upstream)`,
)
if (skipped.length > 0) {
  console.log(`skipped ${skipped.join(', ')} (not assemblies; is_assembly_db)`)
}
{
  const enforced = [...MUST_BE_LOCAL].filter(db =>
    refs.some(ref => ref.db === db),
  )
  console.log(
    `outage-independence enforced on: ${enforced.join(', ') || '(none present)'}`,
  )
}
if (remoteElsewhere.length > 0) {
  console.log(
    `note: ${remoteElsewhere.length} sidecar ref(s) on other assemblies still ` +
      `point upstream and will retry next run: ` +
      [...new Set(remoteElsewhere.map(r => `${r.db}/${r.label}`))].join(', '),
  )
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
