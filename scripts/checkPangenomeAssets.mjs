#!/usr/bin/env node
//
// checkPangenomeAssets.mjs
//
// Every url the pangenome graph configs name, checked before they ship, plus
// whether a newer version of the dataset each one pins has been published.
//
// These configs are the one place in this tree that reads data written by
// ANOTHER repo. `demos/hprc/`, `demos/mouse_pangenome/` and
// `demos/bovine_pangenome/` are produced by jbrowse-components' build scripts;
// `website/pangenome-config/*.json` names those objects and is their only
// consumer here. So a publish over there can leave a config here pointing at a
// file that moved, and push-triggered CI on this side cannot see it -- the same
// shape as the plugin bundles in CLAUDE.md.
//
// It is not hypothetical. Measured 2026-09-09: the tutorials had moved to HPRC
// v2.1 while every url here still named v2.0. Both versions were live in the
// bucket, so nothing 404'd and nothing reported -- we were simply serving the
// older graph, and the committed per-locus summaries under
// website/public/pangenome/ described a different file from the one the
// launches opened.
//
// Three checks, because reachability alone would not have caught that:
//
//   reachable   every url answers. On a track that is a dead lane; on the
//               assembly node it is a config that does not open at all, for
//               the loadPre() reason ADR 0003 records.
//   consistent  all versioned urls WITHIN one config name the same version, so
//               a half-finished bump cannot ship.
//   current     for each version a config pins, the next minor and next major
//               sibling are probed. If one exists, the dataset has moved on.
//
// The pin is read out of the urls rather than declared in the file, on purpose.
// A hand-maintained `pangenomeVersion` key is exactly the thing that drifted,
// and these configs are published files that jbrowse-web parses -- an unknown
// top-level key is not something to add for our own bookkeeping.
//
// "A newer version exists" is REPORTED, not fatal. Staleness has to be loud,
// but the day HPRC publishes v2.2 should not block an unrelated deploy; that
// is the same call check-sidecar-urls makes for assemblies outside
// MUST_BE_LOCAL. Only an unreachable url or an internally inconsistent config
// exits non-zero.
//
// Usage:
//   node scripts/checkPangenomeAssets.mjs [--dir DIR] [--json report.json]
//
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    json: { type: 'string' },
  },
})

const dir = values.dir ?? 'website/pangenome-config'

// Refuse rather than pass vacuously, the same way prune_stray_configs and
// check-orphan-configs do: "no configs found" must never read as "all clear".
if (!fs.existsSync(dir)) {
  console.error(`pangenome config dir ${dir} does not exist; pass --dir`)
  process.exit(2)
}
const files = fs
  .readdirSync(dir)
  .filter(f => f.endsWith('.json') && !f.startsWith('.'))
if (files.length === 0) {
  console.error(`no pangenome configs in ${dir}; refusing to report all clear`)
  process.exit(2)
}

// RgfaTabixAdapter takes a shared PREFIX and appends `.segs.bed.gz` /
// `.links.bed.gz` itself, so the uri as written is not a fetchable object and
// probing it would 404 on a perfectly good config. Expand it to the pair the
// adapter will really ask for, and to their indexes -- a data file whose index
// is missing is the failure `check-tabix-indexes` exists for, one tree over.
function urlsForAdapter(adapter) {
  const uri = adapter.uri
  if (typeof uri !== 'string') {
    return []
  }
  if (adapter.type === 'RgfaTabixAdapter') {
    return ['.segs.bed.gz', '.links.bed.gz'].flatMap(suffix => [
      `${uri}${suffix}`,
      `${uri}${suffix}.tbi`,
    ])
  }
  const indexed = ['.bed.gz', '.vcf.gz', '.gff.gz'].some(e => uri.endsWith(e))
  // csi:true says the index is .csi rather than .tbi. Read the flag rather
  // than inferring from the extension: a Gff3TabixAdapter here sets it, a
  // BedTabixAdapter does not, and both are .gz.
  return indexed
    ? [uri, `${uri}${adapter.csi === true ? '.csi' : '.tbi'}`]
    : [uri]
}

function urlsForAssembly(assembly) {
  const out = []
  const seq = assembly.sequence?.adapter
  if (seq) {
    out.push(...urlsForAdapter(seq))
    if (typeof seq.chromSizes === 'string') {
      out.push(seq.chromSizes)
    }
  }
  const aliases = assembly.refNameAliases?.adapter?.uri
  if (typeof aliases === 'string') {
    out.push(aliases)
  }
  return out
}

const VERSION = /-v(\d+)\.(\d+)-/

const refs = []
const configs = []
for (const file of files) {
  const full = path.join(dir, file)
  let config
  try {
    config = JSON.parse(fs.readFileSync(full, 'utf8'))
  } catch (e) {
    console.error(`${file}: unparseable: ${e}`)
    process.exit(2)
  }
  const urls = [
    ...(config.plugins ?? []).flatMap(p =>
      [p.esmUrl, p.url].filter(u => typeof u === 'string'),
    ),
    ...(config.assemblies ?? []).flatMap(a => urlsForAssembly(a)),
    ...(config.tracks ?? []).flatMap(t => urlsForAdapter(t.adapter ?? {})),
  ]
  const versions = [
    ...new Set(
      urls.flatMap(u => {
        const m = VERSION.exec(u)
        return m ? [`v${m[1]}.${m[2]}`] : []
      }),
    ),
  ].sort()
  configs.push({ file, versions, count: urls.length })
  for (const url of urls) {
    refs.push({ file, url })
  }
}

async function head(url) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(20000),
    })
    return res.ok ? undefined : `HTTP ${res.status}`
  } catch (e) {
    return `${e instanceof Error ? e.message : e}`
  }
}

// ~25 requests against our own bucket, so unlike check-track-urls there is no
// budget to keep. Sequential rather than parallel so a slow edge cannot look
// like a failure.
const broken = []
for (const ref of refs) {
  const problem = await head(ref.url)
  if (problem !== undefined) {
    broken.push({ ...ref, problem })
  }
}

// Probed only on our own bucket. A third-party release re-arranges its paths
// as well as its version (HPRC v2.1 added a `/v2.1/` directory segment that a
// substring swap would miss), so a miss there is expected and a hit on our own
// objects is enough to raise the flag.
async function newerThan(url) {
  const m = VERSION.exec(url)
  if (!m || !url.startsWith('https://jbrowse.org/')) {
    return []
  }
  const [major, minor] = [Number(m[1]), Number(m[2])]
  const candidates = [`v${major}.${minor + 1}`, `v${major + 1}.0`]
  const found = []
  for (const version of candidates) {
    const candidate = url.replace(VERSION, `-${version}-`)
    if ((await head(candidate)) === undefined) {
      found.push({ version, url: candidate })
    }
  }
  return found
}

const stale = []
for (const config of configs) {
  for (const version of config.versions) {
    const sample = refs.find(
      r =>
        r.file === config.file && VERSION.exec(r.url)?.[0] === `-${version}-`,
    )
    for (const hit of sample ? await newerThan(sample.url) : []) {
      stale.push({ file: config.file, pinned: version, ...hit })
    }
  }
}

const inconsistent = configs.filter(c => c.versions.length > 1)

console.log(
  `${refs.length} url(s) across ${configs.length} pangenome config(s)`,
)
for (const c of configs) {
  const label = c.versions.length > 0 ? c.versions.join(' + ') : '(unversioned)'
  console.log(`  ${c.file.padEnd(26)} ${label.padEnd(16)} ${c.count} urls`)
}
for (const ref of broken) {
  console.log(`  FAIL  ${ref.file.padEnd(26)} ${ref.problem}`)
  console.log(`        ${ref.url}`)
}
for (const c of inconsistent) {
  console.log(
    `  MIXED ${c.file.padEnd(26)} names ${c.versions.join(' and ')} in one config`,
  )
}
for (const s of stale) {
  console.log(
    `  STALE ${s.file.padEnd(26)} pins ${s.pinned}, but ${s.version} is published`,
  )
  console.log(`        ${s.url}`)
}

if (values.json) {
  fs.writeFileSync(
    values.json,
    JSON.stringify({ configs, refs, stale }, null, 2),
  )
}

if (broken.length > 0 || inconsistent.length > 0) {
  console.error(
    `\n${broken.length} unreachable url(s) and ${inconsistent.length} config(s) ` +
      `mixing versions.`,
  )
  process.exit(1)
}
if (stale.length > 0) {
  console.log(
    `\nEvery url resolves, but ${stale.length} newer dataset version(s) are ` +
      `published. Bumping one means the config, the explorer summaries derived ` +
      `from it, and the download tables together -- see ` +
      `agent-docs/PANGENOME_PORTAL.md.`,
  )
} else {
  console.log('\nEvery pangenome config url resolves, and none is superseded.')
}
