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
// Four checks, because reachability alone would not have caught that:
//
//   published   the config itself is served at the url the site links, and the
//               bytes served are the bytes in the tree. See below -- this is
//               the one that was missing, and the one whose absence makes a
//               committed config decoration.
//   reachable   every url answers. On a track that is a dead lane; on the
//               assembly node it is a config that does not open at all, for
//               the loadPre() reason ADR 0003 records. Only a 404/410 fails
//               the run -- see below, this cost a false failure the first hour
//               the check mattered.
//   consistent  all versioned urls WITHIN one config name the same version, so
//               a half-finished bump cannot ship.
//   current     for each version a config pins, the next minor and next major
//               sibling are probed. If one exists, the dataset has moved on.
//
// The `published` check exists because `bovine-arsucd12.json` was committed,
// gated by the three checks above, described in a handoff as live -- and 404 in
// the bucket, because `upload.sh` beside it had not been run since it landed.
// Every url INSIDE it resolved, so this script passed on a config no visitor
// could fetch. jbrowse-web reads `?config=` from the reader's own browser and
// genomes.jbrowse.org sends no CORS headers, so the bucket copy is the only one
// that exists as far as a launch is concerned; a config that is only in git is
// a launch that fails before it starts.
//
// Byte comparison rather than existence, for the same reason `upload_if_changed`
// stamps a byte-exact copy: `hprc-grch38.json` was live AND three hundred bytes
// out of date at the same moment, which is invisible to a HEAD.
//
// And read twice on a mismatch, because these urls are behind CloudFront and
// upload.sh's invalidation is not instant: for several minutes after a publish
// the edge still serves the previous copy while the origin has the new one.
// Measured on the publish that fixed the two findings above -- S3 reported 3745
// bytes and a cache-busted GET returned the new trackId while the plain url
// still returned the old. Failing there would report a publish that WORKED as
// a config that is not published, which is the wrong direction to be wrong in:
// the fix a reader would try is to publish again.
//
// The pin is read out of the urls rather than declared in the file, on purpose.
// A hand-maintained `pangenomeVersion` key is exactly the thing that drifted,
// and these configs are published files that jbrowse-web parses -- an unknown
// top-level key is not something to add for our own bookkeeping.
//
// "A newer version exists" is REPORTED, not fatal. Staleness has to be loud,
// but the day HPRC publishes v2.2 should not block an unrelated deploy; that
// is the same call check-sidecar-urls makes for assemblies outside
// MUST_BE_LOCAL.
//
// **And neither is a url that failed without saying it is gone.** These configs
// name three hgdownload 2bit files, and this check runs in run.sh's
// gate_configs -- so treating a network failure as a dead reference makes one
// hgdownload wobble block a deploy. Which is not hypothetical: minutes after
// this check first found anything, hgdownload's primary stopped completing TLS
// (the stall CLAUDE.md documents at length) while hgdownload2 served all three
// 2bits at 200, and this script exited 1 on three perfectly good urls.
//
// So it classifies the way checkTrackUrls.mjs does, for the same reasons and
// with the same vocabulary: only 404/410 is `gone` and fails; a failure that is
// not definitive is retried, then asked of `hgdownload2.soe.ucsc.edu`, and
// reported as `primary-only` if the mirror serves it or `transient` if nobody
// can say. The `published` check stays fatal regardless, because it reads our
// own bucket rather than a research file server.
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
    // For a caller that is about to publish them itself: report the
    // unpublished configs and do not fail on them. run.sh passes this, because
    // its gate runs BEFORE its upload step and a config it is about to publish
    // being unpublished is the expected state rather than a finding.
    'allow-unpublished': { type: 'boolean' },
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
  const text = fs.readFileSync(full, 'utf8')
  let config
  try {
    config = JSON.parse(text)
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
  configs.push({ file, versions, count: urls.length, text })
  for (const url of urls) {
    refs.push({ file, url })
  }
}

// The two statuses that mean "this file is not there", as opposed to "nobody
// answered". Everything else is the server or the network having a bad minute.
const GONE = new Set([404, 410])
const PRIMARY = 'hgdownload.soe.ucsc.edu'
const MIRROR = 'hgdownload2.soe.ucsc.edu'

async function head(url) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(20000),
    })
    return { ok: res.ok, status: res.status, why: `HTTP ${res.status}` }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      why: `${e instanceof Error ? e.message : e}`,
    }
  }
}

// `undefined` for a url that answered, else a verdict. Two attempts before
// reaching for the mirror, so a single dropped connection does not spend a
// request on the other host.
async function probe(url) {
  const first = await head(url)
  if (first.ok) {
    return undefined
  }
  if (GONE.has(first.status)) {
    return { verdict: 'gone', why: first.why }
  }
  const retry = await head(url)
  if (retry.ok) {
    return undefined
  }
  if (GONE.has(retry.status)) {
    return { verdict: 'gone', why: retry.why }
  }
  if (!url.includes(PRIMARY)) {
    return { verdict: 'transient', why: retry.why }
  }
  const mirror = await head(url.replace(PRIMARY, MIRROR))
  return mirror.ok
    ? { verdict: 'primary-only', why: retry.why }
    : GONE.has(mirror.status)
      ? { verdict: 'gone', why: `${retry.why}; ${MIRROR} ${mirror.why}` }
      : { verdict: 'transient', why: `${retry.why}; ${MIRROR} ${mirror.why}` }
}

// ~25 requests against our own bucket, so unlike check-track-urls there is no
// budget to keep. Sequential rather than parallel so a slow edge cannot look
// like a failure.
const broken = []
const primaryOnly = []
const transient = []
for (const ref of refs) {
  const problem = await probe(ref.url)
  if (problem !== undefined) {
    const entry = { ...ref, problem: problem.why }
    if (problem.verdict === 'gone') {
      broken.push(entry)
    } else if (problem.verdict === 'primary-only') {
      primaryOnly.push(entry)
    } else {
      transient.push(entry)
    }
  }
}

// Where upload.sh publishes each config: the file's basename is the bucket
// prefix (`s3://jbrowse.org/pangenome/<name>/config.json`), and that url is
// what `graphBrowser.configUrl` in the website names. Read the published copy
// rather than HEADing it, so "live but stale" is distinguishable from "live".
async function fetchText(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    return res.ok
      ? { text: await res.text() }
      : { problem: `HTTP ${res.status}` }
  } catch (e) {
    return { problem: `${e instanceof Error ? e.message : e}` }
  }
}

async function publishedState(file, localText) {
  const name = file.replace(/\.json$/, '')
  const url = `https://jbrowse.org/pangenome/${name}/config.json`
  const edge = await fetchText(url)
  if (edge.text === localText) {
    return { url }
  }
  // A unique query string is a distinct cache key, so this reaches the origin
  // rather than the warm edge object.
  const origin = await fetchText(`${url}?cachebust=${Date.now()}`)
  if (origin.text === localText) {
    return { url, propagating: true }
  }
  return {
    url,
    problem:
      origin.problem ??
      (edge.problem !== undefined
        ? `${edge.problem} (origin also differs)`
        : 'served copy differs from the file in this tree'),
  }
}

const unpublished = []
const propagating = []
for (const c of configs) {
  const state = await publishedState(c.file, c.text)
  if (state.problem !== undefined) {
    unpublished.push({ file: c.file, ...state })
  } else if (state.propagating) {
    propagating.push({ file: c.file, ...state })
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
    if ((await head(candidate)).ok) {
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
for (const u of unpublished) {
  console.log(`  UNPUB ${u.file.padEnd(26)} ${u.problem}`)
  console.log(`        ${u.url}`)
  console.log(`        run website/pangenome-config/upload.sh`)
}
for (const u of propagating) {
  console.log(
    `  note  ${u.file.padEnd(26)} published, but the edge still serves the previous copy`,
  )
  console.log(`        ${u.url} (invalidation in flight)`)
}
for (const ref of broken) {
  console.log(`  FAIL  ${ref.file.padEnd(26)} ${ref.problem}`)
  console.log(`        ${ref.url}`)
}
for (const ref of primaryOnly) {
  console.log(
    `  WARN  ${ref.file.padEnd(26)} primary failed (${ref.problem}) but ${MIRROR} serves it`,
  )
  console.log(`        ${ref.url}`)
}
for (const ref of transient) {
  console.log(
    `  note  ${ref.file.padEnd(26)} neither resolved nor 404'd: ${ref.problem}`,
  )
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
    JSON.stringify(
      {
        configs: configs.map(({ text: _text, ...c }) => c),
        refs,
        stale,
        unpublished,
        propagating,
        broken,
        primaryOnly,
        transient,
      },
      null,
      2,
    ),
  )
}

const fatalUnpublished = values['allow-unpublished'] ? [] : unpublished
if (
  broken.length > 0 ||
  inconsistent.length > 0 ||
  fatalUnpublished.length > 0
) {
  console.error(
    `\n${broken.length} url(s) gone, ${inconsistent.length} config(s) ` +
      `mixing versions, ${fatalUnpublished.length} config(s) not published as ` +
      `served.`,
  )
  process.exit(1)
}
if (unpublished.length > 0) {
  console.log(
    `\n${unpublished.length} config(s) are not published as committed. Not ` +
      `failing, because --allow-unpublished says the caller publishes them ` +
      `itself.`,
  )
}
if (primaryOnly.length > 0 || transient.length > 0) {
  console.log(
    `\n${primaryOnly.length} url(s) served only by ${MIRROR} and ` +
      `${transient.length} that nobody answered for. Neither fails this run: a ` +
      `404 is a dead reference and anything else is a bad minute on a research ` +
      `file server.`,
  )
}
if (stale.length > 0) {
  console.log(
    `\nEvery url resolves, but ${stale.length} newer dataset version(s) are ` +
      `published. Bumping one means the config, the explorer summaries derived ` +
      `from it, and the download tables together -- see ` +
      `agent-docs/PANGENOME_PORTAL.md.`,
  )
} else {
  console.log(
    '\nEvery pangenome config is published as committed, every url resolves, ' +
      'and none is superseded.',
  )
}
