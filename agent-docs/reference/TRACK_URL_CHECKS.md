---
name: track-url-checks
description:
  'The budgeted track-url canary: the three dead references that motivated it,
  the hgdownload stall behind the budget, what the gate caught, the cb1 and
  hgFixed story, and the reader-facing UCSC status banner.'
---

# Track url checks

Moved out of the root `CLAUDE.md` on 2026-10-08, which keeps the rules. Dated
measurements and incidents read as written at the time.

## Track data files get the same treatment, on a request budget

`pnpm check-track-urls` (`scripts/checkTrackUrls.mjs`) is the sidecar check's
sibling for the other several thousand references: track adapters, their tabix
indexes, multiWig subadapters, the sequence 2bit. A dead sidecar costs a whole
assembly, which is why `checkSidecarUrls.mjs` fails the deploy; a dead track
file costs one track, which is exactly why nothing watched them and three broke
for months. All three were invisible to every existing layer —
`check-plugin-urls` looks at plugins, and `check-config-compat` hydrates an
unopened broken track perfectly cleanly:

- **`rn3-refseq`** named `goldenPath/rn3/bigZips/rn3.2bit`, which does not
  exist. rn3 is nib-era (`nibPath: /gbdb/rn3/nib`), UCSC never built it a
  bigZips 2bit, and its real one is at `/gbdb/rn3/rn3.2bit`. `createAssembly.ts`
  derived the url from a template and never asked whether it resolved — no
  caller checked assembly-node urls at all. It now probes bigZips, falls back to
  `/gbdb`, and keeps bigZips on a _transient_ failure so a blip cannot rewrite a
  good config.
- **`hg38-promoterAi{A,C,G,T}`** named `/gbdb/hg38/_promoterAi/{a,c,g,t}.bw`, a
  directory hgdownload does not publish. `checkIfFileAccessible` ran on
  `.bb`/`.bigBed`/`.bigMaf` only, so the same composite's `overlaps.bb` was
  caught (it is in `blockedFiles.json`) and the four bigWigs beside it were not.
  The check now runs on every branch: whether a file exists has nothing to do
  with its extension.
- **`hg38-cactus447way`** shipped as
  `https://hgdownload.soe.ucsc.eduhttps://hgdownload-test.gi.ucsc.edu/…` — a
  trackDb `bigDataUrl` naming a full url on a _different_ host, concatenated
  onto the base because the guard asked `startsWith(baseUrl)` rather than "is
  absolute". `resolveBigDataUri.ts` is now the one copy of that rule, which
  `buildBigMafTrack.ts` had always had right and `mergeBigFileTracks.ts` had
  wrong.

Three properties of `checkIfFileAccessible` are load-bearing, and each was
broken in turn:

- **The caller passes the assembly.** It used to guess with a regex over seven
  families (`hg\d+|mm\d+|dm\d+|ce\d+|sacCer\d+|danRer\d+|hs\d+`) and return
  `true` _unchecked_ for anything that missed — most of the 238. rn3, galGal6,
  bosTau9 and wuhCor1 were never probed.
- **Only a 404/410 counts as blocked.** `!response.ok` treated a 5xx as "the
  file is gone", recorded it, and then declined to re-check for 90 days. One
  hgdownload wobble mid-run would have stripped tracks off every assembly it
  touched and kept them off for a quarter. A timeout or 5xx now keeps the track
  and caches nothing. `checkIfFileAccessible.test.ts` pins this.
- **But a transient answer is asked again**, three times, before it counts as
  one. "Keep the track, cache nothing" is right for a stalled hgdownload and
  wrong for a blip, and one attempt could not tell them apart: on 2026-09-13
  hg38's `alphaGenome` composite lost a single `TypeError: fetch failed` on
  `/gbdb/hg38/_alphaGenome/a.bw` while `c.bw`, `g.bw` and `t.bw` beside it
  answered 404 in the same second, so the one file of the four that upstream
  does not publish is the one that kept its track — the promoterAi shape again,
  from the opposite direction. Nothing was cached either, so the config shipped
  a 404 that only the budgeted canary would have found, weeks later. A
  definitive answer (any 4xx but 408/429) still costs exactly one request; only
  the failing path retries.

### The budget is the point, not a limitation

hgdownload is a research file server and the same host our users pull from. A
full sweep is 5,484 distinct urls, so the default is **not** a sweep: a
`--budget` of 300 per run spent oldest-first, `--rps 1`, and a state file
(`ucsc2jbrowse/.trackUrlCheck.json`, gitignored) that rests a url for `--ttl` 30
days once it answers. Never-checked urls sort first, so a config regenerated
yesterday is probed tonight while the stable corpus rotates behind it over ~3
weeks. What the budget skipped is always printed — a cap reporting "all clear"
over an unchecked corpus is worse than no check.

That default came out of measurement, and the measurement is worth keeping
because the conclusion is _not_ the obvious one. One unthrottled sweep at
concurrency 14 completed (5,474/5,484 answered), and minutes later hgdownload
stopped serving this host in a very specific way: **the TCP handshake still
completes in ~120ms, the TLS Client Hello goes out, and no Server Hello ever
comes back**, while hgdownload2 and genome.ucsc.edu answered normally. That is
the signature of an exhausted worker pool, _not_ of an IP block — a block drops
SYNs or sends RST. But a connection-limiting module stalls identically, and from
one vantage point there is no distinguishing "we exhausted it" from "it is
exhausted for everyone". So do not record this as proven throttling. The budget
is what makes the question moot: at 300 requests a day nothing here can be the
cause, and the canary stays a canary instead of a suspect.

It recovered on its own ~15 minutes later with nothing done from this end, and
recovered _gradually_: the first success completed its TLS handshake in
**6.9s**, against 1.0s before the sweep and 0.2s on hgdownload2. A policy block
does not ease back in over seconds of handshake latency; a saturated server
does. So the weight of the evidence is on general overload rather than on us
being singled out — which is a better reason to stay small, not a lesser one.
Overload is the condition these configs live in permanently.

Worth knowing for its own sake: hgdownload failing by _stalling_ means client
timeouts rather than fast errors, so a session pointed at it hangs instead of
reporting a broken track.

### Where it runs, and why the two places check different things

- **`run.sh`'s `gate_configs`** runs `--offline`, which fetches nothing. It
  verifies only the _relative_ refs — those name our own bucket, so it is an
  on-disk existence check that catches a config about to name a file we are not
  uploading. `--offline` **errors without a built dir** rather than passing
  vacuously, since relative refs are all it can check.

  Which is exactly how it failed on 2026-08-26, the first time it ever ran:
  `UCSC_BUILT_DIR` is exported by `ucsc2jbrowse/common.sh`, and **run.sh does
  not source that file** — it sources `lib/common.sh` and runs `make.sh` as a
  subprocess — so the gate saw no built dir at all. `checkSidecarUrls.mjs` had
  survived the same hole by hardcoding the path. Both now resolve it through
  `scripts/builtDir.mjs`, which takes an explicit `--built-dir`/env as given and
  falls back to the built-in default **only when it exists**: CI has no built
  tree, and a default that hard-errored there would take the daily canary down.
  run.sh also distinguishes the check's exit 2 (could not run) from exit 1
  (found a broken ref) — reporting the first as the second is what made this
  cost an afternoon.

- **`.github/workflows/track-url-canary.yml`**, daily at 04:20 UTC, does the
  budgeted network rotation and files one rolling `track-url-canary` issue. It
  needs no retry-before-alerting (unlike `config-canary.yml`) because 404 and
  transient are already separated: only 404/410 reach the exit code. Its
  rotation state lives in the actions cache, and a cache miss costs a restarted
  rotation, not a wrong answer.

`hgdownload2.soe.ucsc.edu` is used for one narrow purpose: when the primary
fails, the same path is tried there, and if the mirror serves it the finding is
reported as **primary-only** rather than as a dead reference — deleting the
track would be the wrong fix. Verified 2026-08-25 as a byte-identical drop-in
for both `/goldenPath/` and `/hubs/` paths, `Accept-Ranges: bytes` and
`Access-Control-Allow-Origin: *` on both, from a different UCSC address block
(169.233.10.x vs 128.114.119.x). Nothing in the shipped configs names it, and
only failures reach it, so it adds no load in the normal case.

`myfetchtextWithRetry` (`hubtools/src/util.ts`) is the second such use, and it
is what the hub-backed configs are built through: each of its three rounds asks
the mirror as well as the primary. On 2026-09-06 hgdownload **refused**
connections for a few minutes (`ECONNREFUSED` on 128.114.119.163:443 — an
immediate refusal, not the stall documented above), rn8's live `hub.txt` fetch
lost all three attempts inside the ~6s the backoff spans, and one flaky fetch
exited the whole config build. Only the **text** comes from the mirror — the
caller keeps naming the primary in the `trackDbUrl` it writes — so a fallback
cannot put hgdownload2 in a published config.

Two things about it moved on 2026-09-09, and the first is why the mirror was
never reached during the outage it exists for. **`myfetch` had no deadline.**
node's fetch has none of its own for a connection that completes and then goes
quiet — measured on node 24.2.0 against a socket that accepts and never answers,
a bare `fetch` was still hanging at 45 seconds — so during a stall the first
attempt never returns, the retry never happens and the mirror is never asked.
`FETCH_TIMEOUT_MS` (60s, exported from `hubtools/src/util.ts`) is now the one
number for every fetch in either pipeline: `mirrorSidecars`' downloader,
`checkIfFileAccessible`'s HEAD, `addMitochondrion`'s eutils and chrom.sizes
calls, `processUcscList`, the Wikipedia and Wikidata lookups.
`checkPluginUrls.mjs` carries its own 30s copy, being outside the workspace's
dependency on hubtools; `checkTrackUrls.mjs` and `checkSidecarUrls.mjs` already
had theirs.

**And it no longer retries a definitive answer.** `myfetch` throws an
`HttpError` carrying the status, and a round ends the loop only when _every_
host answered definitively — a mirror 404 while the primary is unreachable is
not evidence the file is gone. A retired hub cost 6 requests and 6s of backoff
to be told the same thing three times; it now costs 2 and no backoff. 408 and
429 stay transient, being the two 4xx that mean "ask again".

### What the gate caught once it could run

Three broken references across the UCSC configs, all invisible to every other
layer and each a different shape:

- **`criGriChoV1-xenoRefGene` named a `.csi` that was never written.** The 80MB
  `xenoRefGene.gff.gz` was fine; `tabix -C` had refused it with
  `Invalid record on sequence #7587: end 1 < begin 4294967295`. One GFF line out
  of millions, and the cause is a `u32` underflow in **bed2gff**: `last_codon`
  computes `max(cds_start, cds_end - 3)`, which wraps for a CDS ending within
  3bp of the contig start — criGriChoV1's xenoRefGene alignment of NM_207404 is
  truncated at scaffold NW_003684908v1's edge, `cdsStart=0 cdsEnd=1`. What made
  it reach the file rather than being caught is that the **same wrap passes the
  completeness gate**: `codon_complete` computed `1 - 4294967294`, which wraps
  to exactly 3. So `cds_end.saturating_sub(3)` alone is not the whole fix —
  `codon_complete` uses `checked_sub` now, so an inverted interval is refused
  rather than laundered into a valid-looking length. `bed2gff/src/codon.rs` has
  all three cases pinned.

  Note the failure mode, because it is the general one here: the pipeline
  produced a file it could not index, `run_for_assemblies_lenient` warned and
  moved on, `needs_rebuild`'s stamp was never written so every later run redid
  the same broken work, and the config shipped naming an index that did not
  exist. That warning said only "parallel reported failures (exit 1)" — a count
  hides a systematic breakage exactly as well as it hides a one-off, so both
  assembly runners now go through a `--joblog` and name the assemblies that
  failed, the way `run_parallel_reporting` has always done for the genark
  sweeps. Nothing in the tree asked "did the index get written". The cheap
  whole-tree version of that question is worth keeping in mind:
  `find $UCSC_BUILT_DIR \( -name '*.gff.gz' -o -name '*.bed.gz' \)` and check
  each for a `.csi`/`.tbi` beside it — 5,793 files, seconds, and as of
  2026-08-26 all of them have one.

  That sweep is also why `.derivation_hash` was **advanced by hand** on
  2026-08-26 (`1e38bbbeb16ba674` → `9a0a9f50214e5de1`) instead of letting the
  fix re-derive all 238 assemblies, and the reasoning is the part to keep: a
  wrapped record makes tabix reject the _whole file_, so any output the fix
  would change necessarily has no index. Every one of the 5,793 had an index
  once criGriChoV1 was rebuilt, and bed2gff feeds only the gene tracks — so
  re-deriving would have reproduced byte-identical output everywhere, for hours.
  Advancing the stamp is only ever sound with an argument of that shape,
  covering the whole corpus rather than a spot check; absent one, take the
  re-derivation.

- **`cb1-*` and `hgFixed-*`**, `Gff3TabixAdapter` on a literal `*.gff.gz`: the
  residue of a shell loop that ran with nullglob off over a directory with
  nothing to match. The shell adder grew its `shopt -s nullglob` long ago
  (`addDerivedTabixTracks` reads the directory now), but **a fix at the source
  only reaches a config that is regenerated**, and neither of these two ever was
  — `is_assembly_db` excluded both from every derivation pass, so their
  `tracks[]` was frozen from 2025-05-13 and no amount of rebuilding would have
  cleared it. Finalization is the one pass that did visit them, so
  `dropGlobTracks` (in `buildConfigs.ts`'s `STEPS`, ahead of the tail that reads
  `tracks[]`) is both the cleanup and the standing guard: a glob character in a
  location is never a key our bucket has. Both exclusions are gone now (below),
  which retires the cleanup and not the guard — the next forgotten nullglob
  would ship through an ordinary regeneration.

### "Not a real assembly" was excusing a url we publish

The canary's next two findings were `cb1`'s 2bit and `chrom.sizes`, both 404,
reported nightly from 2026-08-28. Three earlier places in this file had already
written that pair off — "the only assemblies whose `chrom.sizes` 404s are
`hgFixed` and `cb1`, which `is_assembly_db` already knows are not assemblies" —
and the dismissal was the bug.

**`cb1` is an assembly.** It is an active entry in the live UCSC genome list
(nib-era C. briggsae, July 2002, one 108Mb `chrUn`), with a browser, a trackDb
and a 2bit at `/gbdb/cb1/cb1.2bit` — the same `/gbdb` shape
`resolveSequenceFile` already finds for rn3. It had been skipped since the
pipeline's first commit (`downloadGoldenpath.sh`, `if [ "$p" = "cb1" ]`) with no
reason recorded then or since. Skipping it never stopped us **publishing** it:
the copy step takes the genome list's own keys, `transformGenomeList.ts` stamps
a `jbrowseConfig` url on every entry unconditionally, and
`website/src/list.json` is what the `/ucsc` table renders — so
`genomes.jbrowse.org/ucsc/cb1` was an advertised browser naming a `bigZips` 2bit
and `chrom.sizes` that have never existed. `loadPre()` rejects on either, so it
did not open at all, for a year.

**`hgFixed` is not**, and that is why its config is gone rather than fixed: it
is UCSC's shared metadata database (make.sh rsyncs it for `asmEquivalent`, which
is all it is for), it has no sequence, and it was only in `configs/` because the
copy step appended it by name. Nothing has ever linked to it — every page and
the hubs plugin resolve a genome through the list it is absent from — so this is
a retirement with no reader to strand, unlike the permanent urls
`check-orphan-configs` deliberately refuses to clean up on its own. The
"genome-list keys plus `hgFixed`" rule is now just "genome-list keys", in all
walks that carried it (make.sh's copy step, `buildConfigs.ts`), and
`checkOrphanConfigs.mjs`'s `EXTRA_NAMES` allowance is gone with them.

So `cb1` builds like any other golden-path assembly, and nothing about that is
special-cased: `createAssembly.ts` probes `bigZips` and falls back to `/gbdb`,
and `mirrorAssemblySidecars`'s `provideLocal` hook derives `chrom.sizes` from
the rsynced `chromInfo.txt.gz`, so both 404s go away for the ordinary reason.
Its first `make.sh` sees no `.trackdb_hash` and processes it whole.

Two things the source change alone does not do, both on the build box.
`configs/cb1.json` is only correct once it is **regenerated** — the committed
config still names the dead urls until a run copies the rebuilt one over it, and
the canary reads `ucsc2jbrowse/configs/`, not the source. And
`$UCSC_BUILT_DIR/hgFixed/` still holds the config nothing copies any more;
deleting that directory is what makes the next `uploadAll.sh` drop
`/ucsc/hgFixed/` from the bucket, and until then a
`check-track-urls --built-dir` run still sees its two 404s.

The generalizable half is the shape of the excuse. "It is not a real assembly"
was a claim about **our processing**; what it was excusing was a claim about **a
url we publish**. Those are different questions, and nothing in the pipeline
asks the second one — which is why a config that could not open survived every
gate here until a daily 404 report said so out loud.

### A canary that fails on a permanent finding stops rotating

The same issue was the only thing anyone had seen for three nights, and that was
the second bug. `checkTrackUrls.mjs` is budgeted — 300 urls a run, oldest-first,
the rest of the ~5,500 rotating behind them over ~3 weeks — and the rotation
lives entirely in the `ucsc2jbrowse/.trackUrlCheck.json` that
`track-url-canary.yml` carries in the actions cache.

`actions/cache` declares **`post-if: success()`**. This job fails on purpose
whenever it finds a 404. So from the first permanent finding onward the state
file was never saved: every run restored the same pre-failure snapshot,
re-probed the same first 300 urls, re-reported the same finding, and saved
nothing. Three consecutive nightly comments carried byte-identical counts —
`600 answered OK … 300 to probe … 4602 deferred` — which is what the frozen
rotation looks like if you happen to compare two of them. The other 4,602
references had gone unchecked since the day the first finding landed.

It is now `actions/cache/restore` plus `actions/cache/save` with `if: always()`.
Whatever the probe concluded, it spent the requests and the answers are what
advance the rotation; a finding must not cost them. Worth checking in any
workflow that pairs a cache with a deliberately failing step — the failure mode
is silent in exactly the way the cached thing was supposed to prevent.

Unfreezing the rotation exposes the bug the freeze was hiding, which is why the
two go together. The exit code opens **and closes** the canary's issue, and it
can only speak for the urls that run probed — the script says so itself ("no
findings means none among the 300 probed"). So once the rotation moves past a
known-broken url, the next night finds nothing among its own 300, exits 0, and
the workflow closes the issue with "every probed reference resolves again" while
the config still names a 404. `checkTrackUrls.mjs` therefore **carries every url
last seen `gone` outside the budget**, re-probing it every run: re-confirming a
404 is two requests, and the size of that set is how many broken references we
have not fixed yet, which is a number we control. Verified by hand on 2026-08-30
against cb1's two: with `--budget 5` they are re-checked and reported, and the
run still fails.

### Readers get told, because a stall reports nothing on its own

`UcscStatusBanner` (`website/src/components/UcscStatusBanner.astro`, wording in
`website/src/lib/ucscStatusBanner.ts`, probe in
`website/src/lib/ucscLiveness.ts`) warns on the launch pages when hgdownload is
not answering. It exists because the stall described above is **completely
silent to the reader**: jbrowse-core sets no timeout on those fetches, so
nothing rejects and nothing is reported. A track sits on a loading spinner
forever, and `loadPre()`'s `Promise.all` never settles — the browser is "still
loading" indefinitely with no way to learn that a server elsewhere is the
reason.

The real fix is in the session, and it is **not reachable from this repo**: the
hang lives in the hosted jbrowse-web build and in
`@cmdcolin/jbrowse-plugin-hubs`, and a fix in either would not reach the pinned
older hosts our permanent config urls still serve. So this warns one step
earlier, on the page the reader launches from. Treat it as a consolation prize,
not the cure — the cure is a fetch deadline in core or in the Hubs plugin, which
every one of the UCSC configs loads.

**It measures a difference, not a timeout.** A dropped wifi link times out
against hgdownload exactly as a stalled hgdownload does, and so does a tracking
blocker or a corporate proxy; `navigator.onLine` reports the interface, not
whether packets arrive. So each probe is two parallel bodiless HEADs —
hgdownload's `hg38.chrom.sizes` and a same-origin control (`/favicon.ico`) — and
only the combination is evidence. Control slow or failing ⇒ `unknown`, say
nothing. Control fast + UCSC timeout ⇒ `stalled`. Control fast + UCSC over 2.5s
⇒ `slow`. Anything else ⇒ nothing. A non-timeout error status is deliberately
`unknown` too: a 5xx is upstream having a bad day, and describing it as the hang
would describe the wrong failure. `ucscLiveness.test.ts` pins every one of those
branches, the false-alarm ones especially.

Four things not to undo:

- **The probe's hard deadline.** The failure being detected is a connection that
  never answers, so a probe without `AbortSignal.timeout` would hang exactly
  like the thing it is diagnosing and the banner would never appear during the
  outage it exists for.
- **The banner names the consequence per arm, not just "UCSC is down".** A UCSC
  assembly still opens (its sidecars are mirrored) and loses the sequence track
  plus UCSC-served tracks; a GenArk assembly does not open at all, because its
  `chromSizes` and `refNameAliases` are both remote and both in that same
  `Promise.all`. That distinction is the actionable part.
- **Mounted only on pages a reader launches from** (`accession/[id]`,
  `ucsc/[id]`, `ucsc/index`, `hubs/[slug]`, `taxonomy/[slug]`, `search` and the
  recently-updated pages), probing when the browser is idle, with the verdict
  shared across tabs and page views in `localStorage` for 2 minutes. Cost to
  UCSC therefore scales with distinct readers per window rather than with page
  views, and one bodiless HEAD is a rounding error beside the hundreds of range
  requests the session that reader is about to launch makes against the same
  host. Putting it in `Layout.astro` would be simpler and would probe from the
  blog.
- **A plain script, not a React island.** On the accession and `/ucsc/<db>`
  pages the banner was the only island, so it shipped React to them: measured
  2026-09-24 on an accession page, 77 KB of gzipped JavaScript (65 KB of it
  `react-dom`) plus 4.7 KB of inline island runtime in each of ~52,000 pages'
  HTML, for a warning that almost never shows. The header search, the page's
  only other script, is 2.2 KB.
