---
name: track-url-checks
description:
  'The budgeted track-url canary: the three dead references that motivated it,
  the hgdownload stall behind the budget, what the gate caught, the cb1 and
  hgFixed story, and the reader-facing UCSC status banner.'
---

# Track url checks

## `check-track-urls` probes track data files on a request budget

`pnpm check-track-urls` (`scripts/checkTrackUrls.mjs`) checks the several
thousand references the sidecar check does not cover: track adapters, their
tabix indexes, multiWig subadapters and the sequence 2bit. A dead sidecar breaks
a whole assembly, so `checkSidecarUrls.mjs` fails the deploy. A dead track file
breaks one track, so nothing watched track files, and three broke for months
without any existing layer reporting them: `check-plugin-urls` reads plugins,
and `check-config-compat` loads an unopened broken track without error.

- **`rn3-refseq`** named `goldenPath/rn3/bigZips/rn3.2bit`, which does not
  exist. rn3 is nib-era (`nibPath: /gbdb/rn3/nib`), UCSC never built it a
  bigZips 2bit, and its real 2bit is at `/gbdb/rn3/rn3.2bit`.
  `createAssembly.ts` derived the url from a template and never checked that it
  resolved, and no caller checked assembly-node urls at all. It now probes
  bigZips, falls back to `/gbdb`, and keeps bigZips on a transient failure so a
  momentary error cannot rewrite a good config.
- **`hg38-promoterAi{A,C,G,T}`** named `/gbdb/hg38/_promoterAi/{a,c,g,t}.bw`, a
  directory hgdownload does not publish. `checkIfFileAccessible` ran on
  `.bb`/`.bigBed`/`.bigMaf` only, so it caught the same composite's
  `overlaps.bb` (listed in `blockedFiles.json`) and missed the four bigWigs
  beside it. The check now runs on every branch, whatever the file's extension.
- **`hg38-cactus447way`** shipped as
  `https://hgdownload.soe.ucsc.eduhttps://hgdownload-test.gi.ucsc.edu/…`: a
  trackDb `bigDataUrl` naming a full url on a different host, concatenated onto
  the base because the guard tested `startsWith(baseUrl)` instead of whether the
  url is absolute. `resolveBigDataUri.ts` is now the one copy of that rule,
  which `buildBigMafTrack.ts` had always implemented correctly and
  `mergeBigFileTracks.ts` had not.

`checkIfFileAccessible` depends on three properties, and each was broken in
turn:

- **The caller passes the assembly.** The function used to guess the assembly
  with a regex over seven families
  (`hg\d+|mm\d+|dm\d+|ce\d+|sacCer\d+|danRer\d+|hs\d+`) and return `true`
  unchecked for anything that missed, which was most of the 238. rn3, galGal6,
  bosTau9 and wuhCor1 were never probed.
- **Only a 404/410 counts as blocked.** `!response.ok` treated a 5xx as "the
  file is gone", recorded it, and then declined to re-check for 90 days, so one
  hgdownload error mid-run would have stripped tracks off every assembly it
  touched and kept them off for a quarter. A timeout or 5xx now keeps the track
  and caches nothing. `checkIfFileAccessible.test.ts` pins this.
- **A transient answer is retried three times before it counts as one.** Keeping
  the track and caching nothing is right for a stalled hgdownload and wrong for
  a single dropped request, and one attempt cannot tell the two apart. On
  2026-09-13 hg38's `alphaGenome` composite got one `TypeError: fetch failed` on
  `/gbdb/hg38/_alphaGenome/a.bw` while `c.bw`, `g.bw` and `t.bw` beside it
  answered 404 in the same second. The one file of the four that upstream does
  not publish kept its track, which is the promoterAi failure from the opposite
  direction. The function cached nothing either, so the config shipped a 404
  that only the budgeted canary would have found, weeks later. A definitive
  answer (any 4xx except 408/429) still costs one request; only the failing path
  retries.

### The budget protects hgdownload

hgdownload is a research file server and the same host our users pull from. A
full sweep is 5,484 distinct urls, so by default the check does not sweep: it
spends a `--budget` of 300 urls per run, oldest first, at `--rps 1`, and a state
file (`ucsc2jbrowse/.trackUrlCheck.json`, gitignored) rests a url for `--ttl` 30
days once it answers. Never-checked urls sort first, so the check probes a
config regenerated yesterday tonight, while the stable corpus rotates behind it
over ~3 weeks. The check always prints what the budget skipped, because a capped
check reporting "all clear" over an unchecked corpus is worse than no check.

The 300-url default came from a measurement whose conclusion runs against the
obvious reading. One unthrottled sweep at concurrency 14 completed (5,474/5,484
answered), and minutes later hgdownload stopped serving this host: the TCP
handshake still completed in ~120ms and the TLS Client Hello went out, but no
Server Hello came back, while hgdownload2 and genome.ucsc.edu answered normally.
That matches an exhausted worker pool more than an IP block, since a block drops
SYNs or sends RST. A connection-limiting module stalls the same way, though, and
from one vantage point "we exhausted it" and "it is exhausted for everyone" look
identical, so do not record this as proven throttling. At 300 requests a day
nothing this check does can be the cause, so the question does not need an
answer.

hgdownload recovered ~15 minutes later with nothing done from this end, and
recovered gradually: the first success completed its TLS handshake in 6.9s,
against 1.0s before the sweep and 0.2s on hgdownload2. A policy block does not
ease back in over seconds of handshake latency, and a saturated server does, so
the evidence points to general overload more than to this host being singled
out. Overload is the permanent condition these configs are served under, which
is a stronger reason to keep the check small.

Because hgdownload fails by stalling, a client sees timeouts instead of fast
errors, and a session pointed at it hangs instead of reporting a broken track.

### `gate_configs` and the canary check different things

- **`run.sh`'s `gate_configs`** runs `--offline`, which fetches nothing. It
  checks only the relative refs, which name our own bucket, so it is an on-disk
  existence check that catches a config about to name a file we are not
  uploading. `--offline` **errors without a built dir** instead of passing,
  since relative refs are all it can check.

  **run.sh does not source `ucsc2jbrowse/common.sh`**, which exports
  `UCSC_BUILT_DIR`, so the scripts resolve the built dir through
  `scripts/builtDir.mjs`. It takes an explicit `--built-dir`/env as given and
  falls back to the built-in default only when that directory exists: CI has no
  built tree, and a default that errored there would fail the daily canary.
  run.sh reports the check's exit 2 (could not run) separately from exit 1
  (found a broken ref).

- **`.github/workflows/track-url-canary.yml`** runs daily at 04:20 UTC, does the
  budgeted network rotation and files one rolling `track-url-canary` issue.
  Unlike `config-canary.yml`, it needs no retry before alerting, because the
  script already separates 404 from transient: only 404/410 reach the exit code.
  The rotation state is stored in the actions cache, and a cache miss restarts
  the rotation without producing a wrong answer.

The check uses `hgdownload2.soe.ucsc.edu` for one purpose: when the primary
fails, it tries the same path there, and if the mirror serves it, it reports the
finding as **primary-only**, because deleting the track would be the wrong fix.
On 2026-08-25 the mirror was a byte-identical drop-in for both `/goldenPath/`
and `/hubs/` paths, with `Accept-Ranges: bytes` and
`Access-Control-Allow-Origin: *` on both, from a different UCSC address block
(169.233.10.x against 128.114.119.x). No shipped config names it, and only
failures reach it, so it adds no load in the normal case.

`myfetchtextWithRetry` (`hubtools/src/util.ts`) is the second user of the
mirror, and the hub-backed configs are built through it: each of its three
rounds asks the mirror as well as the primary. On 2026-09-06 hgdownload refused
connections for a few minutes (`ECONNREFUSED` on 128.114.119.163:443, an
immediate refusal unlike the stall above), rn8's live `hub.txt` fetch lost all
three attempts inside the ~6s the backoff spans, and that one fetch failure
ended the whole config build. Only the text comes from the mirror; the caller
keeps naming the primary in the `trackDbUrl` it writes, so a fallback cannot put
hgdownload2 in a published config.

Of the two changes on 2026-09-09 that fixed the fallback, the first explains why
the mirror was never reached during the outage it was written for: **`myfetch`
had no deadline.** node's fetch sets none for a connection that completes and
then goes quiet; on node 24.2.0, against a socket that accepts and never
answers, a bare `fetch` was still hanging at 45 seconds. During a stall the
first attempt never returned, so the retry never ran and the mirror was never
asked. `FETCH_TIMEOUT_MS` (60s, exported from `hubtools/src/util.ts`) is now the
one deadline for every fetch in either pipeline: `mirrorSidecars`' downloader,
`checkIfFileAccessible`'s HEAD, `addMitochondrion`'s eutils and chrom.sizes
calls, `processUcscList`, and the Wikipedia and Wikidata lookups.
`checkPluginUrls.mjs` defines its own 30s copy, since it is outside the
workspace's dependency on hubtools; `checkTrackUrls.mjs` and
`checkSidecarUrls.mjs` already had theirs.

**`myfetch` no longer retries a definitive answer.** It throws an `HttpError`
with the status, and a round ends the loop only when every host answered
definitively, because a mirror 404 while the primary is unreachable is no
evidence the file is gone. A retired hub used to cost 6 requests and 6s of
backoff to get the same answer three times; it now costs 2 and no backoff. 408
and 429 stay transient, as the two 4xx statuses that mean "ask again". When any
host answered transiently, the loop throws that transient error, so a primary
timeout beside a mirror 404 never reaches a caller as `HttpError` 404.

### What the gate caught once it could run

The gate found three broken references across the UCSC configs, none of which
any other layer had reported, each failing differently:

- **`criGriChoV1-xenoRefGene` named a `.csi` that was never written.** The 80MB
  `xenoRefGene.gff.gz` was fine; `tabix -C` had rejected it with
  `Invalid record on sequence #7587: end 1 < begin 4294967295`. That is one GFF
  line out of millions, caused by a `u32` underflow in **bed2gff**: `last_codon`
  computes `max(cds_start, cds_end - 3)`, which wraps for a CDS ending within
  3bp of the contig start. criGriChoV1's xenoRefGene alignment of NM_207404 is
  truncated at scaffold NW_003684908v1's edge, with `cdsStart=0 cdsEnd=1`. The
  bad line reached the file because the same wrap passes the completeness check:
  `codon_complete` computed `1 - 4294967294`, which wraps to exactly 3.
  `cds_end.saturating_sub(3)` alone therefore does not fix it; `codon_complete`
  now uses `checked_sub`, so it rejects an inverted interval instead of turning
  it into a valid-looking length. `ucsc2jbrowse/src/genePredToGff.ts` replaced
  bed2gff on 2026-10-28 and writes no codon rows.

  The pipeline produced a file it could not index, and every safeguard let it
  through: `run_for_assemblies_lenient` warned and moved on, `needs_rebuild`'s
  stamp was never written so every later run redid the same broken work, and the
  config shipped naming an index that did not exist. The warning said only
  "parallel reported failures (exit 1)". A count hides a systematic breakage as
  well as a one-off, so both assembly runners now go through a `--joblog` and
  name the assemblies that failed, as `run_parallel_reporting` always has for
  the genark sweeps. `pnpm check-tabix-indexes`
  (`agent-docs/reference/DERIVED_FILE_INTEGRITY.md`) is the first check in the
  tree for whether the index got written. The same whole-tree sweep is the
  argument that justified advancing `.derivation_hash` by hand for this fix
  (`agent-docs/reference/UCSC_PIPELINE.md`).

- **`cb1-*` and `hgFixed-*`** were `Gff3TabixAdapter` tracks on a literal
  `*.gff.gz`, left by a shell loop that ran with nullglob off over a directory
  with nothing to match. The shell adder got its `shopt -s nullglob` long ago
  (`addDerivedTabixTracks` now reads the directory), but a fix at the source
  reaches only a config that is regenerated, and neither of these two ever was:
  `is_assembly_db` excluded both from every derivation pass, so their `tracks[]`
  had not changed since 2025-05-13 and no rebuild would have cleared it.
  Finalization was the one pass that visited them, so `dropGlobTracks` (in
  `buildConfigs.ts`'s `STEPS`, ahead of the tail that reads `tracks[]`) both
  cleans them up and guards against the next one: a glob character in a location
  is never a key in our bucket. Both exclusions are gone now (next section),
  which retires the cleanup and keeps the guard, since the next forgotten
  nullglob would ship through an ordinary regeneration.

### "Not a real assembly" was excusing a url we publish

The canary's next two findings were `cb1`'s 2bit and `chrom.sizes`, both 404,
reported nightly from 2026-08-28. Three earlier places in this file had already
dismissed that pair ("the only assemblies whose `chrom.sizes` 404s are `hgFixed`
and `cb1`, which `is_assembly_db` already knows are not assemblies"), and the
dismissal was the bug.

**`cb1` is an assembly.** It is an active entry in the live UCSC genome list
(nib-era C. briggsae, July 2002, one 108Mb `chrUn`), with a browser, a trackDb
and a 2bit at `/gbdb/cb1/cb1.2bit`, in the same `/gbdb` layout
`resolveSequenceFile` already finds for rn3. The pipeline had skipped it since
its first commit (`downloadGoldenpath.sh`, `if [ "$p" = "cb1" ]`), with no
reason recorded then or since. Skipping it never stopped us publishing it: the
copy step takes the genome list's keys, `transformGenomeList.ts` stamps a
`jbrowseConfig` url on every entry unconditionally, and the `/ucsc` table
renders `website/src/list.json`. So `genomes.jbrowse.org/ucsc/cb1` advertised a
browser naming a `bigZips` 2bit and a `chrom.sizes` that never existed.
`loadPre()` rejects on either, so for a year the browser did not open at all.

**`hgFixed` is not an assembly**, so its config was retired instead of fixed. It
is UCSC's shared metadata database (make.sh rsyncs it for `asmEquivalent` and
nothing else), it has no sequence, and it was in `configs/` only because the
copy step appended it by name. No page ever linked to it, since every page and
the hubs plugin resolve a genome through the list it is absent from, so retiring
it stranded no reader. The permanent urls `check-orphan-configs` refuses to
clean up on its own are a different case. The "genome-list keys plus `hgFixed`"
rule is now just "genome-list keys" in every walk that had it (make.sh's copy
step, `buildConfigs.ts`), and `checkOrphanConfigs.mjs`'s `EXTRA_NAMES` allowance
is gone too.

`cb1` now builds like any other golden-path assembly, with no special case:
`createAssembly.ts` probes `bigZips` and falls back to `/gbdb`, and
`mirrorAssemblySidecars`'s `provideLocal` hook derives `chrom.sizes` from the
rsynced `chromInfo.txt.gz`, so both 404s are fixed by the ordinary code path.
Its first `make.sh` finds no `.trackdb_hash` and processes it whole.

Retiring `hgFixed` also meant deleting `$UCSC_BUILT_DIR/hgFixed/`, since
`uploadAll.sh` syncs the built tree, not `configs/`, and serves a directory
there whether or not a mirror of it survives. The sync's `*.checked` and `*.bak`
excludes leave two objects behind
(`agent-docs/todo/ucsc-hgfixed-bucket-leftovers.md`).

"It is not a real assembly" was a claim about our processing, used to excuse a
claim about a url we publish. The pipeline has no check for the second claim, so
a config that could not open passed every gate here until a daily 404 report
named it.

### A canary that fails on a permanent finding stops rotating

For three nights the canary reported only that one finding, which was the second
bug. `checkTrackUrls.mjs` probes 300 urls a run, oldest first, with the rest of
the ~5,500 rotating behind them over ~3 weeks, and the rotation state is all in
the `ucsc2jbrowse/.trackUrlCheck.json` that `track-url-canary.yml` keeps in the
actions cache.

`actions/cache` declares **`post-if: success()`**, and this job fails on purpose
whenever it finds a 404. From the first permanent finding onward the workflow
never saved the state file: every run restored the same pre-failure snapshot,
re-probed the same first 300 urls, re-reported the same finding and saved
nothing. Three consecutive nightly comments had byte-identical counts
(`600 answered OK … 300 to probe … 4602 deferred`), which is how a frozen
rotation shows up when two comments are compared. The other 4,602 references
went unchecked from the day of the first finding.

The workflow now uses `actions/cache/restore` plus `actions/cache/save` with
`if: always()`. Whatever the probe concluded, it spent the requests, and saving
the answers is what advances the rotation, so a finding must not discard them.
Check any workflow that pairs a cache with a step that fails on purpose: the
lost save raises no error, which is the failure the cache was meant to prevent.

Unfreezing the rotation exposed the bug the freeze was hiding, so the two fixes
go together. The exit code opens and closes the canary's issue, and it covers
only the urls that run probed; the script says so ("no findings means none among
the 300 probed"). Once the rotation moved past a known-broken url, the next
night would find nothing among its 300, exit 0, and the workflow would close the
issue with "every probed reference resolves again" while the config still named
a 404. `checkTrackUrls.mjs` therefore re-probes every url last seen `gone` on
every run, outside the budget: re-confirming a 404 costs two requests, and the
size of that set is the number of broken references not yet fixed, which we
control. A run by hand on 2026-08-30 with `--budget 5` re-checked and reported
cb1's two urls and still failed.

### `UcscStatusBanner` tells readers when hgdownload stalls

`UcscStatusBanner` (`website/src/components/UcscStatusBanner.astro`, wording in
`website/src/lib/ucscStatusBanner.ts`, probe in
`website/src/lib/ucscLiveness.ts`) warns on the launch pages when hgdownload is
not answering. The reader gets no other signal of the stall described above:
jbrowse-core sets no timeout on those fetches, so nothing rejects and nothing is
reported. A track shows a loading spinner forever, and `loadPre()`'s
`Promise.all` never settles, so the browser stays "loading" with no sign that a
server elsewhere is the reason.

The fix belongs in the session and cannot be made from this repo: the hang is in
the hosted jbrowse-web build and in `@cmdcolin/jbrowse-plugin-hubs`, and a fix
in either would not reach the pinned older hosts our permanent config urls still
serve. The banner warns one step earlier, on the page the reader launches from.
It does not cure the hang; that needs a fetch deadline in core or in the Hubs
plugin, which every UCSC config loads.

**The banner compares two probes instead of timing one.** A dropped wifi link
times out against hgdownload just as a stalled hgdownload does, and so does a
tracking blocker or a corporate proxy; `navigator.onLine` reports the network
interface, not whether packets arrive. Each probe is therefore two parallel
bodiless HEADs, one for hgdownload's `hg38.chrom.sizes` and one for a
same-origin control (`/favicon.ico`), and only the combination counts as
evidence:

- Control slow or failing ⇒ `unknown`, and the banner says nothing.
- Control fast and UCSC timing out ⇒ `stalled`.
- Control fast and UCSC over 2.5s ⇒ `slow`.
- Anything else ⇒ nothing.

A non-timeout error status is `unknown` on purpose: a 5xx means upstream is
failing in some other way, and describing it as the hang would be wrong.
`ucscLiveness.test.ts` pins every branch, especially the false-alarm ones.

Four properties to keep:

- **The probe's hard deadline.** The banner detects a connection that never
  answers, so a probe without `AbortSignal.timeout` would hang like the thing it
  diagnoses, and the banner would never appear during the outage it was written
  for.
- **The banner names the consequence per assembly kind, not just "UCSC is
  down".** A UCSC assembly still opens (its sidecars are mirrored) and loses the
  sequence track plus UCSC-served tracks. A GenArk assembly does not open at
  all, because its `chromSizes` and `refNameAliases` are both remote and both in
  the same `Promise.all`. That difference tells the reader what to do.
- **The banner mounts only on pages a reader launches from** (`accession/[id]`,
  `ucsc/[id]`, `ucsc/index`, `hubs/[slug]`, `taxonomy/[slug]`, `search` and the
  recently-updated pages), probes when the browser is idle, and shares the
  verdict across tabs and page views in `localStorage` for 2 minutes. Requests
  to UCSC therefore scale with distinct readers per window instead of with page
  views, and one bodiless HEAD is negligible beside the hundreds of range
  requests the reader's session is about to make against the same host. Putting
  the banner in `Layout.astro` would be simpler and would probe from the blog.
- **The banner is a plain script, not a React island.** On the accession and
  `/ucsc/<db>` pages the banner was the only island, so it shipped React to
  them: measured on 2026-09-24 on an accession page, 77 KB of gzipped JavaScript
  (65 KB of it `react-dom`) plus 4.7 KB of inline island runtime in each of
  ~52,000 pages' HTML, for a warning that almost never shows. The header search,
  the page's only other script, is 2.2 KB.
