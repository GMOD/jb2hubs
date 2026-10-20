---
name: genark-pipeline
description:
  'How genark2jbrowse builds 52,720 hub configs in one pass, refreshes hub.txt
  by rsync, fetches NCBI GFFs, and why hubs/ stays in the repo.'
---

# The GenArk pipeline

## A GenArk config is built in one pass, and written in its final format

`genark2jbrowse/src/buildConfigsBatch.ts` assembles each hub's `config.json` in
memory (hub.txt → NCBI GFF track, trix adapter and genetic codes →
`genArkExtensions/` → liftOver synteny tracks → `enhanceConfigObject`) and
writes it once, only when the text differs from what is on disk. It builds all
52,720 in **17 seconds**. It replaced seven read-modify-write passes, which
started `@jbrowse/cli` ~89,000 times and left configs half-built when a run
aborted.

The pure half is `buildHubConfig` (`src/buildConfig.ts`). Its step order is the
order the old passes ran in, because that order sets every published config's
**key order**. On 2026-09-01 we built all 52,720 into a scratch tree and diffed
them against the committed `hubs/`:

- 52,718 were byte-identical, once the `indexingFeatureTypesToInclude` list
  (which hubtools stopped writing on 2026-08-28) was dropped from the committed
  side, since the tree had not been regenerated after that change.
- 2 differed only in a liftOver track name that today's `all.json` spells
  differently.

Re-verify the same way after touching the builder. `--out-root <dir>` writes the
configs there and touches nothing else, so the diff is cheap.

The one-pass build made three deliberate changes, each removing a cost that grew
with the 52,720 hubs:

- **The output is already in oxfmt's format.** `formatJson` (`hubtools`) prints
  what `oxfmt` prints for a `.json` file at printWidth 80, checked on 3,000
  committed configs, and the batch writes with it. `pnpm run format` in `run.sh`
  used to reflow every hub config on every run, so an aborted run showed 52,475
  modified files: the pipeline wrote one layout and the formatter another. The
  batch now leaves an unchanged hub's file alone, so `git status` mid-run lists
  only hubs whose content changed.
- **Genetic codes are derived once, beside the GFF.** `deriveGeneticCodes.sh`
  writes `bgz/<gff>.codes.tsv` (empty when there are none, so a present file
  means "derived"), and runs only when that sidecar is missing or older than the
  GFF. The old pass re-scanned every 100 MB GFF through awk on every hub visit.
  The builder refuses a GFF without a sidecar, where it would otherwise write a
  config with no codes and report nothing.
- **The hub's copy of the GFF is a hard link to `bgz/`**, matched by inode. The
  `--load copy` it replaced made a third copy of ~40 GB and re-copied it on
  every `--all` run.

`jbrowse text-index` still runs, but **after** the batch writes the config
(`textIndex.sh`, over the hub dirs the batch prints as needing an index). The
CLI reads the indexing policy off the track's `textSearching` slot. The old
order indexed a freshly generated config before enhance had added the policy, so
a `--reprocess-all` built indexes of UUIDs that contradicted the config. The CLI
rewrites `config.json` in its own layout, and `scripts/formatConfigs.ts`
restores the oxfmt layout.

### No rebuild gate, because every phase is cheap or gated on its output

genark has no `.pipeline_hash`, unlike `ucsc2jbrowse/make.sh`. A run visits
every hub every time and rebuilds what is stale per file. The config build takes
17 seconds for the corpus, and every other phase is gated on its own output:

- a GFF is downloaded when absent and processed when newer than its output;
- genetic codes are derived when the sidecar is missing;
- chain files are probed once per hub;
- a hub is text-indexed when its index is older than the GFF.

`--all` is accepted and changes nothing, and `--reprocess-all` still forces
everything. Before 2026-09-01 the pipeline never regenerated an existing hub's
config, so a converter change reached none of the 52,000 until someone
remembered `--reprocess-all`.

### A derived url that 404s gets a sentinel

`hubtools`' `parseAssemblyEntry` **builds** each hub's `ncbiGff` url from the
accession; NCBI does not publish it. For an assembly NCBI never annotated, the
directory exists and has no `*_genomic.gff.gz`. We checked `GCF_002986165.1` by
hand: it has the fna, the gbff and the assembly report, and no gff. The only
gate was whether the download existed, so the pipeline requested those urls on
**every run, forever**. On 2026-09-09 every log going back weeks showed the same
71 urls attempted and the same 71 failed, costing 27s and 142 lines of
`Fetching…/Failed…` per run against ftp.ncbi.nlm.nih.gov.

`downloadNcbiGff.sh` now writes a `gff/<file>.notfound` sentinel, the way
`ncbi.json.notfound` records a missing metadata record. It writes one only on a
404/410, read off the failed GET's status, so the steady state is zero requests
instead of 71. A timeout or 5xx leaves no sentinel, so an ftp.ncbi.nlm.nih.gov
outage cannot switch off an annotation we have a url for.

- `NOTFOUND_TTL_DAYS` (90) expires a sentinel, so the pipeline still picks up an
  annotation NCBI publishes later.
- `FETCH_UPDATES=1` ignores sentinels, and a successful fetch clears one.
- The script prints the count of suppressed urls. Without that count, a whole
  class of assembly could stop getting an annotation with nothing in the log.
- mtime is a safe clock for the TTL here, unlike in `buildNcbiQueue.ts`, because
  `gff/` is gitignored, so no clone resets its mtimes.

### A hub.txt can include another trackDb

Eleven hubs end with `include <accession>.userTrackDb.txt` (gorilla
`GCA_029281585.2`, among them). `@gmod/ucsc-hub` skips `include` lines and
nothing fetched the file, so their configs published without those tracks until
2026-10-12. `hubtools/src/hubIncludes.ts` lists the names and splices the text
in place; `generateJBrowseConfigForAssemblyHub` takes it as `includes`. The UCSC
hub-backed path passes `await fetchIncludes(hubFileText, hub)` to the same
function (`ucsc2jbrowse/src/buildConfigs.ts`) and fails the assembly when one is
gone.

### A GFF NCBI re-annotated in place is fetched again

NCBI re-annotates an assembly at the same url (`GCF_000092205.1-RS_2025_07_03`
became `-RS_2026_07_03` in the same `*_genomic.gff.gz`), and the pipeline
fetched each GFF once. On 2026-09-24, 1,049 of 44,648 downloads held an older
release than NCBI publishes. `src/staleNcbiGffs.ts` finds them without a
request, by comparing each download's `#!annotation-source` header with its
hub's `ncbi.json`, and `downloadNcbiGff.sh` fetches those again, at most
`STALE_GFF_MAX` (1,000) a run.

`isLaterRelease` (hubtools) counts a release as later only when it can prove it:
a later `RS_` date, a higher "Annotation Release" number, or the step from
numbered to dated releases. A superseded assembly's report reads "Annotation
submitted by NCBI RefSeq", which orders against no other release, so the
pipeline asks NCBI for nothing for it.

Every fetch is a `curl -z` into a temp file, for two reasons:

- **The new copy's mtime is the fetch time.** `wget -N` kept upstream's
  Last-Modified, and `processGffFiles.sh` rebuilds `bgz/` only from a GFF newer
  than it, so a re-annotation published before our last rebuild was downloaded
  and never processed. GCF_000092205.1's was: NCBI replaced it on 2026-07-04,
  and `bgz/` was rebuilt on 2026-07-21. `FETCH_UPDATES=1` had the same gap all
  along.
- **A transfer cut short leaves the previous file in place.** wget wrote in
  place, and every later gate treated a truncated download as present.

`downloadNcbiGff.test.sh` pins both against a stub curl. The UCSC side needs
none of this: `ucsc2jbrowse/downloadNcbiGff.sh` rebuilds from a fresh `datasets`
zip whenever it fetches, and a survey of its 72 GFFs the same day found them all
current.

### A GCA hub's gene search comes from xenoRefGene

GCA hubs get no NCBI GFF, so the text index above never covers them. 7,885 of
them have UCSC's `xenoRefGene` bigBed, which holds RefSeq mRNAs from other
species aligned to the assembly and named only by accession.
`xenoSymbolIndex.sh` joins those accessions to symbols cut from NCBI's
`gene2refseq.gz` and writes `trix/<accession>.ix` in `jbrowse text-index`'s
record format, one record per symbol per overlapping cluster, indexing the
symbol only. The config gets the same `trixAdapter` entry a GCF hub gets, so
every JBrowse release that searches a GCF hub searches these.

- **The index is built before the config**, and `buildConfigsBatch.ts` adds the
  entry only when the index exists. A hub whose bigBed failed to fetch therefore
  has no search, which is better than a broken one.
- **The bigBeds are an rsync mirror** (`genark2jbrowse/xenoRefGene/`, ~2 GB).
  `rsync -t` over the daemon, 4,000 paths a connection, skips a file whose size
  and mtime match and keeps upstream's mtime on the copy, so UCSC sends each
  bigBed once and afterwards only the ones it changed. The script rebuilds a
  hub's index when it is older than the mirrored bigBed or the symbol table, so
  a symbol refresh and `--reprocess-all` read the mirror and ask UCSC for
  nothing.
- **The symbol table is refreshed every 30 days** (`refseqSymbols/`, 4 minutes
  and 2.4 GB streamed from NCBI), and a refresh rebuilds every index.

## rsync refreshes each hub.txt

`downloadHubs.ts` used to fetch a hub's `hub.txt` the first time the assembly
list named it and never again outside `--reprocess-all`. Whatever UCSC later
changed in that hub (renamed labels, a RepeatMasker track switched to `bigRmsk`,
a new liftOver chain to a sibling assembly) never reached its config. On
2026-09-01, 18,846 of 52,720 upstream `hub.txt` files had an mtime newer than
our copy, 3 of 12 sampled differed in content, and the first full sync changed
278 of them in content.

`genark2jbrowse/make.sh` refreshes them in three steps, with a few dozen rsync
connections in total. 52,000 HEAD requests against hgdownload is the load the
track-url canary's budget exists to avoid.

- **`listUpstreamHubs.sh`** reports, for every hub, the size and mtime of
  `hub.txt` and whether the `2bit` and `chrom.sizes.txt` exist. It refuses a
  listing under 10,000 hubs, because a truncated one would read as "every hub
  retired". `listUpstreamHubs.test.sh` pins the parser, the refusal and the
  dispatch below.

  hgdownload publishes **`hubs/genArkFileList.txt.gz`**, a daily manifest of all
  2.07M paths under `hubs/GCA` and `GCF` (10.5 MB, downloads in 0.15 s). The
  script reads the accessions from it without walking any directory, and asks
  `rsync --files-from` to stat only the ~158,000 paths we read. That takes **13
  s**, against 775 s for the rsync walk of `hubs/GCA/` and `GCF/` it replaced.
  The walk stays in the script as `walk_upstream_hubs`, since it needs nothing
  from upstream but the rsync daemon; `HUB_LIST_MODE=walk` forces it, and the
  default falls back to it.

  Three measurements explain the speedup, and the first applies beyond this
  script. The walk's cost is hgdownload reading ~110,000 directories it then
  discards, and that cost depends almost entirely on the server's **cache**: the
  same GCA walk takes 68.8 s cold and 1.85 s warm, 37×, with 0.49 s of that on
  our side. Statting named paths barely changes with the cache: the same GCF/002
  stat takes 0.547 s cold and 0.532 s warm. **Parallelising the walk does not
  help**: four concurrent cold walks moved 188 hubs/s against 117 single-stream
  (~1.2× for 3× the connections, excluding the one subtree that came back warm),
  because the server is throughput-bound rather than latency-bound.

  The replacement depends on two things. **`--files-from` must be chunked**,
  because rsync's handling of it is quadratic in the list length: the whole
  corpus in one call spends **74.8 s of client CPU**, against 8 s of wall clock
  in chunks of 4,000. Until we found that, the manifest version was slower than
  the walk. **The manifest proposes candidates, and rsync answers**:
  `src/upstreamHubCandidates.ts` unions the manifest's accessions with our own
  `hubs/` tree (so a hub gone upstream still gets a stat, which is how the
  script finds it gone) and with the assembly list (so a hub added in the last
  day is not reported as never having existed). rsync's `--ignore-missing-args`
  leaves a missing path out of the output. No downstream step reads the
  manifest, so none can read a stale answer from it.

  On 2026-09-04 we compared the new listing against a full walk taken the same
  hour. The 52,722 `hub.txt` rows were **byte-identical**, the new listing
  invented nothing, and both consumers agreed exactly (`staleHubTxt.ts` gave
  identical output, and `downloadHubs.ts` gave identical verdicts, 24 gone and 0
  missing-sequence). The rows only the walk had were 1,221
  `<acc>.repeatModeler.2bit` and one `<acc>.chrNames.2bit`, which matched its
  `*.2bit` glob and which no consumer looks for, since `downloadHubs.ts` asks
  for `<accession>.2bit` by name.

- **`src/staleHubTxt.ts`** prints the paths whose local size or mtime differs
  from the listing, and `rsync -t --files-from` copies exactly those. `-t` keeps
  upstream's mtime on the copy, so the comparison is exact from then on and
  needs no stamp file. A fresh checkout, whose mtimes are checkout times, costs
  one full copy (all 52,720 in 890 s) and is exact after it. `git status` on
  `hubs/**/hub.txt` then shows which changed in **content**, and the pipeline
  removes those hubs' `liftOver/.checked`, so the chain probe runs again for
  them. A refreshed `hub.txt` is the only way the pipeline finds a new chain.
- **`downloadHubs.ts`** fetches only hubs with no `hub.txt` yet, and reports two
  things the assembly list does not contain:
  - Every accession the list names that the listing did not find, split by
    whether we publish a config for it. UCSC's `assemblyList.json` names 23 hubs
    that have never existed on hgdownload (404 on both hosts, absent from
    rsync), and those are noise. A hub we have and upstream no longer does is
    the finding, and the script no longer fetches it.
  - Every hub whose `2bit` or `chrom.sizes.txt` is gone. That is the GenArk half
    of the sidecar problem, since `loadPre()` fails the whole assembly on
    either. The same stat pass answers it, with none of the 105k requests the
    reverted mirroring sweep made.

The rsync daemon lags the web host by under an hour (192 files changed upstream
between the first listing and its copy, and were current on the next listing),
so a few "still stale" entries right after a sync come from that lag.

A failed listing makes `make.sh` skip the refresh for that run and say so, and
the pipeline deletes nothing on the evidence of either listing. A hub gone
upstream stays at its permanent url until someone decides otherwise
(GCF_000001405.40 is one:
`agent-docs/ideas/waiting-on-a-call/genark-retire-grch38-p14-hub.md`).

## `all.json` refuses to shrink by more than 5%

`processHubJson.ts` turns UCSC's per-category listings into
`processedHubJson/all.json`, and every accession page, search entry and hub
table comes from that file. On 2026-10-19 it lost the whole viral category
(53,123 → 38,646 hubs) and the run deployed the smaller site:

- GCF_002831045.2's `ncbi.json` was an Entrez esummary from August 2025, with no
  `reports` array.
- 882667e8 had narrowed `parseAssemblyEntry`'s catch to a missing file, so
  reading it threw a TypeError.
- A per-category catch-all in `processHubJson.ts` logged the error and skipped
  the category.

a4b71448 lists such a hub without its NCBI metadata and removed the catch-all.
`assertNoSharpShrink` (`publishedHubs.ts`) also refuses an `all.json` more than
5% smaller than the one on disk, so a listing UCSC serves short fails the run
too. `ALLOW_HUB_LIST_SHRINK=1` accepts a deliberate drop.

## `hubs/` stays in git, and no tool reads its history

The 52,720 GenArk configs (260k tracked files, 1.5 GB at HEAD) are committed on
purpose. `git diff` after a run is the one place that shows _what_ changed in
which hub, and we check a converter change against it before shipping. On
2026-09-01 git cost little: `git status` took 1.4 s and `git diff --stat hubs/`
4.8 s. The per-run traffic (1 to 100 hubs) did not grow the repo to 1.2 GB on
GitHub; corpus-wide rewrites did, and four of them in late August were the
formatter reflowing what the pipeline wrote. The one-pass builder writes oxfmt's
format directly, so those rewrites no longer happen.

Before 2026-09-01 the history mattered for one date. The recently-updated page
needs the time each hub first appeared, and the only record was the commit that
added its config, so `generateRecentlyUpdated.ts` walked `git log -- hubs/`
(1.2M lines) and run.sh had to commit `hubs/` before the website build could
run. **`genark2jbrowse/hubFirstSeen.json`** now holds that record: each
accession mapped to the ISO time of the run that first built its config. It was
seeded once from the git log on 2026-09-01, `buildConfigsBatch.ts` appends any
accession it lacks (never under `--out-root`), and run.sh commits it beside
`hubs/`. The builder writes it with `formatJson`, like the configs, so an
ordinary run adds one line per new hub and reflows nothing.

No tool reads the history any more
(`agent-docs/ideas/waiting-on-a-number/genark-squash-hubs-history.md`). We
considered committing a manifest of hashes in place of the files and rejected
it: a manifest shows which hubs changed but not what changed in them, and that
second half is what catches a converter regression.
