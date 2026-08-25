#!/usr/bin/env node
//
// checkTrackUrls.mjs
//
// Every data file the shipped configs name, checked against the artifact rather
// than against the code path that produced it.
//
// checkSidecarUrls.mjs already covers the three assembly sidecars, because one
// dead sidecar costs a whole assembly. This covers the other several thousand
// references -- track adapters, their indexes, multiWig subadapters, the
// sequence 2bit -- where a dead url costs one track. Individually cheap, and
// that is exactly why nothing was watching them.
//
// It exists because three broken references shipped for months, and none was
// reachable from the in-pipeline check (`checkIfFileAccessible`, CHECK_404):
//
//   rn3-refseq                    goldenPath/rn3/bigZips/rn3.2bit
//     A nib-era assembly: UCSC never built it a bigZips 2bit, and no caller
//     checked assembly-node urls at all.
//
//   hg38-promoterAi{A,C,G,T}      gbdb/hg38/_promoterAi/{a,c,g,t}.bw
//     A directory hgdownload does not publish. The check ran on .bb/.bigBed/
//     .bigMaf only, so the composite's overlaps.bb was caught and the four
//     bigWigs beside it were not.
//
//   hg38-cactus447way             hgdownload.soe.ucsc.eduhttps://hgdownload-test...
//     A trackDb bigDataUrl naming a full url on a DIFFERENT host, concatenated
//     onto the base because the guard tested startsWith(baseUrl) rather than
//     "is absolute". Unfetchable, and the check never saw the mangled string.
//
// All three are fixed at the source. This is the layer that does not care where
// the hole is: it reads what we publish and fetches it. A generator that grows a
// new template, a branch that forgets the check, or a file upstream withdraws
// all surface here the same way.
//
// LOAD IS THE DESIGN CONSTRAINT
//
// hgdownload is a research-institute file server, not a CDN, and it is the same
// host our users' sessions are already pulling from. A full sweep is 5,484
// distinct urls; running that on a 6-hourly timer would be ~22k HEAD requests a
// day against a service whose outages are the reason this exists.
//
// Writing this script involved one unthrottled sweep of all 5,484 refs at
// concurrency 14. It completed (5,474 of 5,484 answered), and some minutes later
// hgdownload.soe.ucsc.edu stopped serving this host, in a specific way worth
// recording: the TCP handshake still completes in ~120ms, curl sends its TLS
// Client Hello, and no Server Hello ever comes back. Meanwhile hgdownload2 and
// genome.ucsc.edu answer normally.
//
// Accept-then-stall is what an exhausted worker pool looks like -- the kernel
// takes the connection off the backlog and nothing services it. It is NOT the
// signature of an IP block, which drops SYNs or sends a RST. But a
// connection-limiting module produces the same stall, and from one vantage point
// there is no way to tell "we exhausted it" from "it is exhausted for
// everybody". That question needs a probe from an address that has not been
// sweeping, which is exactly what nobody has when they need it.
//
// So the budget below is not a proven remedy for a proven cause. It is what
// makes the question moot: at 300 requests a day nothing here can be the reason
// hgdownload stops answering, and the daily canary stays a canary instead of
// becoming a suspect.
//
// The stall is also worth knowing for its own sake. hgdownload failing this way
// means client-side timeouts rather than fast errors, so a JBrowse session
// pointed at it hangs instead of reporting a broken track -- which is why
// --timeout exists and defaults to 30s rather than waiting indefinitely.
//
// So the default is not a sweep:
//
//   - a REQUEST BUDGET per run (--budget, default 300), spent oldest-first
//   - a rate limit (--rps, default 1) regardless of concurrency
//   - a state file remembering when each url last answered, so a url confirmed
//     good within --ttl days is not asked again
//
// Never-checked urls sort first, so a newly generated config is probed on the
// next run rather than whenever its turn comes round -- which is the case that
// matters, since our own configs are what change. The stable corpus rotates
// behind it, all 5,484 over about three weeks of daily runs at one request a
// second. What the budget left unchecked is always printed: a cap that reports
// "all clear" while skipping most of the corpus would be worse than no check.
//
// Pass --all for a deliberate full audit, and pass --rps 1 with it. Prefer --db
// over --all when you know which assemblies you touched.
//
// WHAT COUNTS AS A LOCATION
//
// Adapter subtrees name files in two shapes, both of which recursion reaches: a
// bare `chromSizes` string on TwoBitAdapter, and `uri` -- directly, under a
// `*Location` node (bedGz, gffGz, pifGz, bigWig, bigBed, nh), under
// `index.location`, or inside `subadapters[]` / `sequenceAdapter` /
// `summaryAdapter` / `annotationAdapter`. Every other string in an adapter is a
// type, a color, a sample label or a field name.
//
// Track prose is deliberately out of scope. The configs carry UCSC's trackDb
// html, which links ncbi, ebi, ensembl and a long tail of lab pages -- roughly
// 700 urls that are documentation, not data. A rotted citation is not a broken
// track, and probing them would both swamp the signal and multiply the load.
//
// 404 IS A FINDING; A TIMEOUT IS WEATHER
//
// The same distinction mirrorSidecars.ts and checkIfFileAccessible.ts draw. A
// 404/410 means the file is gone and the config is wrong. A timeout, a 5xx or a
// 429 means hgdownload is having a moment -- which it does, and which a script
// asking thousands of questions helps cause. Treating those as failures would
// turn one blip into a blocked deploy and get the check muted, so they are
// reported and do not affect the exit code unless --fail-on-transient.
//
// A url that fails on hgdownload is retried once, then tried on
// hgdownload2.soe.ucsc.edu, which serves the same tree from a different UCSC
// address block. When the mirror answers, the file exists and the primary is
// the problem: reported as a primary-only failure, not a dead reference,
// because deleting the track would be the wrong fix. Only failures reach the
// mirror, so it adds no load in the normal case.
//
// Usage:
//   node scripts/checkTrackUrls.mjs                       # budgeted, incremental
//   node scripts/checkTrackUrls.mjs --db hg38,hg19        # everything for these
//   node scripts/checkTrackUrls.mjs --all --rps 1         # full audit, gently
//   node scripts/checkTrackUrls.mjs --built-dir DIR       # + verify relatives
//   node scripts/checkTrackUrls.mjs --offline --built-dir DIR   # relatives only
//
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    'configs-dir': { type: 'string' },
    'built-dir': { type: 'string' },
    db: { type: 'string' },
    all: { type: 'boolean' },
    offline: { type: 'boolean' },
    budget: { type: 'string' },
    rps: { type: 'string' },
    ttl: { type: 'string' },
    state: { type: 'string' },
    concurrency: { type: 'string' },
    timeout: { type: 'string' },
    json: { type: 'string' },
    'fail-on-transient': { type: 'boolean' },
  },
})

const RPS = Number(values.rps ?? 1)
const CONCURRENCY = Number(values.concurrency ?? 2)
const TIMEOUT_MS = Number(values.timeout ?? 30_000)
const TTL_DAYS = Number(values.ttl ?? 30)
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000
// An explicit --db is already a narrow ask, so it is not budgeted; --all is the
// deliberate full audit. Neither bypasses the rate limit.
//
// --offline spends nothing, which is what makes this usable in run.sh's
// pre-upload gate. The check that matters before an upload is the one for
// relative refs -- a config naming a file our own bucket does not have -- and
// that is an on-disk existence test needing no network at all. Hunting upstream
// 404s is the daily canary's job: it is a slow-moving question, and a blocking
// gate is the wrong place to spend hgdownload's patience.
const BUDGET = values.offline
  ? 0
  : values.all || values.db
    ? Infinity
    : Number(values.budget ?? 300)

const PRIMARY = 'hgdownload.soe.ucsc.edu'
const MIRROR = 'hgdownload2.soe.ucsc.edu'

const STATE_FILE =
  values.state ?? path.join('ucsc2jbrowse', '.trackUrlCheck.json')

const builtDir = values['built-dir'] ?? process.env.UCSC_BUILT_DIR

// Relative refs are the only thing --offline can check, and they resolve against
// the built tree. Without one there is nothing left to do, and the run would
// print a clean bill of health having verified nothing -- the exact failure mode
// this script exists to catch elsewhere.
if (values.offline && !builtDir) {
  console.error(
    '--offline needs the built tree to check anything: relative refs resolve ' +
      'against it, and the remote urls are what --offline declines to fetch. ' +
      'Pass --built-dir or set UCSC_BUILT_DIR.',
  )
  process.exit(2)
}

const configsDir =
  values['configs-dir'] ??
  (builtDir ? undefined : path.join('ucsc2jbrowse', 'configs'))

const only = values.db
  ? new Set(values.db.split(',').map(s => s.trim()))
  : undefined

const isRemote = v => v.startsWith('http://') || v.startsWith('https://')
const canMirror = url => url.includes(PRIMARY)

const LOCATION_KEYS = new Set(['uri', 'chromSizes'])

function collectLocations(node, out) {
  if (!node || typeof node !== 'object') {
    return
  }
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      if (LOCATION_KEYS.has(key)) {
        out.push(value)
      }
    } else {
      collectLocations(value, out)
    }
  }
}

// Adapters only, never the track body: `metadata.ucsc.html` is prose and
// `description` is text. Walking the whole track would pull in the ~700
// documentation links this deliberately ignores.
function locationsOfConfig(config) {
  const refs = []
  const add = (adapter, label) => {
    const found = []
    collectLocations(adapter, found)
    for (const value of found) {
      refs.push({ label, value })
    }
  }
  for (const assembly of config.assemblies ?? []) {
    add(assembly.sequence?.adapter, assembly.sequence?.trackId ?? 'sequence')
    add(assembly.refNameAliases?.adapter, 'refNameAliases')
    add(assembly.cytobands?.adapter, 'cytobands')
  }
  for (const track of config.tracks ?? []) {
    add(track.adapter, track.trackId ?? '(unnamed track)')
  }
  return refs
}

function readConfigs() {
  const out = []
  if (builtDir) {
    if (!fs.existsSync(builtDir)) {
      console.error(`built dir ${builtDir} does not exist`)
      process.exit(1)
    }
    for (const entry of fs.readdirSync(builtDir, { withFileTypes: true })) {
      const file = path.join(builtDir, entry.name, 'config.json')
      if (entry.isDirectory() && fs.existsSync(file)) {
        out.push({ db: entry.name, file, dir: path.join(builtDir, entry.name) })
      }
    }
  } else {
    if (!fs.existsSync(configsDir)) {
      console.error(`configs dir ${configsDir} does not exist`)
      process.exit(1)
    }
    for (const name of fs.readdirSync(configsDir)) {
      if (name.endsWith('.json')) {
        out.push({
          db: name.replace(/\.json$/, ''),
          file: path.join(configsDir, name),
        })
      }
    }
  }
  return out.filter(c => !only || only.has(c.db))
}

const configs = readConfigs()
if (configs.length === 0) {
  console.error('no configs found')
  process.exit(1)
}

const refs = []
const unparseable = []
for (const { db, file, dir } of configs) {
  let config
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    unparseable.push({ db, problem: String(e) })
    continue
  }
  for (const ref of locationsOfConfig(config)) {
    refs.push({ db, dir, ...ref })
  }
}

// Relative refs name our own bucket. Without a built dir there is nothing to
// compare them against -- the committed configs travel without their data -- so
// they are counted and skipped rather than assumed fine. Free either way: no
// network.
const relative = refs.filter(ref => !isRemote(ref.value))
const missingLocal = []
if (builtDir) {
  for (const ref of relative) {
    const file = path.join(ref.dir, ref.value)
    if (!fs.existsSync(file)) {
      missingLocal.push({ ...ref, problem: 'not on disk' })
    } else if (fs.statSync(file).size === 0) {
      missingLocal.push({ ...ref, problem: 'empty' })
    }
  }
}

// One probe per distinct url, however many tracks name it. hg38's gnomAD and
// JASPAR files in particular are referenced from several tracks each.
const byUrl = new Map()
for (const ref of refs) {
  if (!isRemote(ref.value)) {
    continue
  }
  if (!byUrl.has(ref.value)) {
    byUrl.set(ref.value, [])
  }
  byUrl.get(ref.value).push(ref)
}

// Remembering when a url last answered is what makes this incremental. It is
// keyed by url, not by assembly, so a file several configs share is one entry
// and moving a track between assemblies does not re-probe it.
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return { urls: {} }
  }
}
const state = loadState()
state.urls ??= {}

const now = Date.now()
const fresh = []
const stale = []
for (const url of byUrl.keys()) {
  const seen = state.urls[url]
  // Only a clean answer earns a rest. A url last seen as transient is retried
  // next run, which is what turns "inconclusive" into a real verdict quickly.
  if (seen?.verdict === 'ok' && now - seen.at < TTL_MS) {
    fresh.push(url)
  } else {
    stale.push({ url, at: seen?.at ?? 0 })
  }
}
// Never-checked (at: 0) first, then the longest unchecked. A config generated
// today is probed on the next run rather than whenever its turn comes round.
stale.sort((a, b) => a.at - b.at)
const queue = stale.slice(0, BUDGET === Infinity ? stale.length : BUDGET)
const deferred = stale.length - queue.length

const GONE = new Set([404, 410])

// A token-bucket gate every request passes through, so --concurrency controls
// how many can be in flight and --rps controls how fast they are issued. The
// second is the one that matters to the far end.
let nextSlot = now
async function throttle() {
  const wait = Math.max(0, nextSlot - Date.now())
  nextSlot = Math.max(nextSlot, Date.now()) + 1000 / RPS
  if (wait > 0) {
    await new Promise(resolve => setTimeout(resolve, wait))
  }
}

async function head(url) {
  await throttle()
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return { status: res.status, ok: res.ok }
  } catch (e) {
    return { status: 0, ok: false, error: e.message ?? String(e) }
  }
}

// A 404 is believed on the first answer -- upstream is unambiguous about a file
// it does not have, and re-asking to confirm just doubles the load. Everything
// else gets a second chance, then the mirror.
async function probe(url) {
  const first = await head(url)
  if (first.ok || GONE.has(first.status)) {
    return { ...first, verdict: first.ok ? 'ok' : 'gone' }
  }
  const retry = await head(url)
  if (retry.ok) {
    return { ...retry, verdict: 'ok' }
  }
  if (GONE.has(retry.status)) {
    return { ...retry, verdict: 'gone' }
  }
  if (!canMirror(url)) {
    return { ...retry, verdict: 'transient' }
  }
  const mirror = await head(url.replace(PRIMARY, MIRROR))
  if (mirror.ok) {
    return { ...retry, verdict: 'primary-only', mirrorStatus: mirror.status }
  }
  if (GONE.has(mirror.status)) {
    return { ...retry, verdict: 'gone', mirrorStatus: mirror.status }
  }
  return { ...retry, verdict: 'transient', mirrorStatus: mirror.status }
}

console.log(
  `${refs.length} data refs across ${configs.length} configs: ` +
    `${byUrl.size} distinct remote urls, ${relative.length} relative`,
)
if (!builtDir && relative.length > 0) {
  console.log(
    `not verifying the ${relative.length} relative refs: they resolve against ` +
      `the built tree, which this checkout does not have. Pass --built-dir.`,
  )
}
if (values.offline) {
  console.log(
    `--offline: checking only that relative refs exist on disk. None of the ` +
      `${byUrl.size} remote urls will be fetched.`,
  )
} else {
  console.log(
    `${fresh.length} answered OK within ${TTL_DAYS}d and are skipped; ` +
      `${queue.length} to probe at ${RPS}/s` +
      (deferred > 0 ? `; ${deferred} deferred by --budget ${BUDGET}` : ''),
  )
}

const results = new Map()
let done = 0
let cursor = 0
async function worker() {
  while (cursor < queue.length) {
    const { url } = queue[cursor++]
    results.set(url, await probe(url))
    done++
    if (done % 100 === 0 || done === queue.length) {
      process.stderr.write(`  probed ${done}/${queue.length}\n`)
    }
  }
}
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
)

for (const [url, result] of results) {
  state.urls[url] = { verdict: result.verdict, status: result.status, at: now }
}
// Urls no longer named by any config would otherwise accumulate forever.
for (const url of Object.keys(state.urls)) {
  if (!byUrl.has(url)) {
    delete state.urls[url]
  }
}
fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`)

const gone = []
const primaryOnly = []
const transient = []
for (const [url, result] of results) {
  const entry = { url, ...result, refs: byUrl.get(url) }
  if (result.verdict === 'gone') {
    gone.push(entry)
  } else if (result.verdict === 'primary-only') {
    primaryOnly.push(entry)
  } else if (result.verdict === 'transient') {
    transient.push(entry)
  }
}

const describe = entry =>
  entry.refs
    .map(r => `${r.db}/${r.label}`)
    .slice(0, 4)
    .join(', ') +
  (entry.refs.length > 4 ? ` +${entry.refs.length - 4} more` : '')

console.log()
for (const entry of unparseable) {
  console.log(`  FAIL  ${entry.db}: config.json ${entry.problem}`)
}
for (const entry of missingLocal) {
  console.log(
    `  FAIL  ${entry.db}/${entry.label}: relative ref ${entry.problem}: ${entry.value}`,
  )
}
for (const entry of gone) {
  console.log(`  GONE  HTTP ${entry.status || 'unreachable'}  ${entry.url}`)
  console.log(`        named by ${describe(entry)}`)
}
for (const entry of primaryOnly) {
  console.log(
    `  WARN  primary failed (${entry.status || entry.error}) but ${MIRROR} ` +
      `serves it: ${entry.url}`,
  )
  console.log(`        named by ${describe(entry)}`)
}
if (transient.length > 0) {
  console.log(
    `  note  ${transient.length} url(s) neither resolved nor 404'd (timeout, ` +
      `5xx or rate limit). Not treated as broken, and retried next run rather ` +
      `than resting for ${TTL_DAYS}d:`,
  )
  for (const entry of transient.slice(0, 10)) {
    console.log(`          ${entry.status || entry.error}  ${entry.url}`)
  }
  if (transient.length > 10) {
    console.log(`          +${transient.length - 10} more`)
  }
}

if (values.json) {
  fs.writeFileSync(
    values.json,
    JSON.stringify(
      {
        checkedAt: new Date(now).toISOString(),
        configs: configs.length,
        refs: refs.length,
        distinctUrls: byUrl.size,
        probed: queue.length,
        skippedFresh: fresh.length,
        deferredByBudget: deferred,
        gone: gone.map(e => ({ url: e.url, status: e.status, refs: e.refs })),
        primaryOnly: primaryOnly.map(e => ({ url: e.url, status: e.status })),
        transient: transient.map(e => ({
          url: e.url,
          status: e.status,
          error: e.error,
        })),
      },
      null,
      2,
    ),
  )
}

const fatal =
  unparseable.length +
  missingLocal.length +
  gone.length +
  (values['fail-on-transient'] ? transient.length : 0)

console.log()
if (deferred > 0 && !values.offline) {
  console.log(
    `${deferred} url(s) were NOT checked this run. This is a partial pass: ` +
      `"no findings" means none among the ${queue.length} probed.`,
  )
}
if (fatal > 0) {
  console.error(
    `${fatal} reference(s) are broken. Each one is a track that cannot open ` +
      `in production; a config naming a 404 is invisible to every other gate.`,
  )
  process.exit(1)
}
if (values.offline) {
  console.log(
    `Every relative ref resolves on disk. Upstream urls unchecked by design ` +
      `-- that is the daily track-url canary's job.`,
  )
} else {
  console.log(
    `No broken references among the ${queue.length} probed` +
      (primaryOnly.length > 0
        ? `, though ${primaryOnly.length} needed the mirror to prove it`
        : '') +
      (transient.length > 0 ? ` (${transient.length} inconclusive)` : '') +
      '.',
  )
}
