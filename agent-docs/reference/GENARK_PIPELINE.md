---
name: genark-pipeline
description:
  'How genark2jbrowse builds 52,720 hub configs in one pass, refreshes hub.txt
  by rsync, fetches NCBI GFFs, and why hubs/ stays in the repo.'
---

# The GenArk pipeline

Moved out of the root `CLAUDE.md` on 2026-10-08, which keeps the rules. Dated
measurements and incidents read as written at the time.

## A GenArk config is built in one pass, and written in its final format

`genark2jbrowse/src/buildConfigsBatch.ts` assembles each hub's `config.json` in
memory — hub.txt → NCBI GFF track, trix adapter and genetic codes →
`genArkExtensions/` → liftOver synteny tracks → `enhanceConfigObject` — and
writes it once, only when the text differs from what is on disk. Until
2026-09-01 that was seven read-modify-write passes by five tools (a generator,
`jbrowse add-track`, `jbrowse text-index`, two jq splices, an extension merger,
a chain-track adder, then enhance), each leaving a half-built config on disk
between them: 52,720 hubs × 7 parses, ~89,000 `@jbrowse/cli` process starts, and
a run that was aborted mid-way left every config in whatever intermediate state
its pass had reached. The one pass builds all 52,720 in **17 seconds**.

The pure half is `buildHubConfig` (`src/buildConfig.ts`), and the step order in
it is the order the passes used to run, because that order is what every
published config's **key order** is. Verified on 2026-09-01 by building all
52,720 into a scratch tree and diffing against the committed `hubs/`: 52,718
byte-identical once the `indexingFeatureTypesToInclude` list hubtools stopped
writing on 2026-08-28 is dropped from the committed side (the tree had not been
regenerated since), and 2 differing only in a liftOver track name that today's
`all.json` spells differently. Re-verify the same way after touching it —
`--out-root <dir>` writes the configs there and touches nothing else, which is
what makes the diff cheap.

Three things the pass changed on purpose, each removing a cost that scaled with
52,720:

- **The output is already in oxfmt's format.** `formatJson` (`hubtools`) prints
  what `oxfmt` prints for a `.json` file at printWidth 80, checked on 3,000
  committed configs, and the batch writes with it. `pnpm run format` in `run.sh`
  used to reflow every hub config on every run, which is why an aborted run
  showed 52,475 modified files: the pipeline wrote one shape and the formatter
  another. Now an unchanged hub is not rewritten at all, so `git status` mid-run
  lists only hubs whose content moved.
- **Genetic codes are derived once, beside the GFF.** `deriveGeneticCodes.sh`
  writes `bgz/<gff>.codes.tsv` (empty when there are none, so presence means
  "derived"), gated on the sidecar being missing or older than the GFF. The old
  pass re-scanned every 100 MB GFF through awk on every hub visit. The builder
  refuses a GFF without a sidecar rather than silently writing a config with no
  codes.
- **The hub's copy of the GFF is a hard link to `bgz/`**, matched by inode, not
  a `--load copy`. That was a third copy of ~40 GB and a re-copy on every
  `--all` run.

`jbrowse text-index` still runs, but **after** the config is written
(`textIndex.sh`, over the hub dirs the batch prints as needing an index). It
reads the indexing policy off the track's `textSearching` slot, and the old
order indexed a freshly generated config before enhance had put the policy on it
— so a `--reprocess-all` was building indexes of UUIDs while the config said
otherwise. The CLI rewrites `config.json` in its own layout; `formatConfigs.ts`
puts those back.

### A derived url that 404s is not a download that has not happened yet

`hubtools`' `parseAssemblyEntry` **builds** each hub's `ncbiGff` url from the
accession; NCBI does not publish it. For an assembly NCBI never annotated the
directory is there and the `*_genomic.gff.gz` simply is not — checked by hand on
`GCF_002986165.1`, which has the fna, the gbff and the assembly report and no
gff. Existence of the download was the only gate, so those urls were requested
again on **every run, forever**: measured 2026-09-09, the same 71 attempted and
the same 71 failed in every log going back weeks, 27s and 142 lines of
`Fetching…/Failed…` per run against ftp.ncbi.nlm.nih.gov.

`downloadNcbiGff.sh` now writes a `gff/<file>.notfound` sentinel, the way
`ncbi.json.notfound` records a missing metadata record, and only on a 404/410 —
read off the failed GET's own status, so the steady state is zero requests
rather than 71. A timeout or 5xx leaves no sentinel, so an ftp.ncbi.nlm.nih.gov
blip cannot switch off an annotation we do have a url for. `NOTFOUND_TTL_DAYS`
(90) expires it so an annotation published later is still picked up,
`FETCH_UPDATES=1` ignores it, and a successful fetch clears it. The count of
suppressed urls is printed, because a suppression nobody can see is how a whole
class of assembly quietly stops getting an annotation. mtime is a safe clock
here, unlike in `buildNcbiQueue.ts`, because `gff/` is gitignored and so
survives no clone to have its mtimes reset.

### A GFF NCBI re-annotated in place is fetched again

NCBI re-annotates an assembly at the same url (`GCF_000092205.1-RS_2025_07_03`
became `-RS_2026_07_03` in the same `*_genomic.gff.gz`), and a GFF was fetched
once, so on 2026-09-24 1,049 of 44,648 held an older release than NCBI
publishes. `src/staleNcbiGffs.ts` finds them without a request, by comparing
each download's `#!annotation-source` header with its hub's `ncbi.json`, and
`downloadNcbiGff.sh` fetches those again, at most `STALE_GFF_MAX` (1,000) a run.
Only a provably later release counts (`isLaterRelease`, hubtools): a later `RS_`
date, a higher "Annotation Release" number, or the step from numbered to dated.
A superseded assembly's report reads "Annotation submitted by NCBI RefSeq",
which orders against nothing, so it asks NCBI for nothing.

Every fetch is a `curl -z` into a temp file, and both halves matter:

- **The new copy's mtime is the fetch time.** `wget -N` kept upstream's
  Last-Modified, and `processGffFiles.sh` rebuilds `bgz/` only from a GFF newer
  than it, so a re-annotation published before our last rebuild was downloaded
  and never processed. GCF_000092205.1's was: replaced upstream 2026-07-04,
  `bgz/` rebuilt 2026-07-21. That hole was in `FETCH_UPDATES=1` all along.
- **A transfer cut short leaves the previous file.** wget wrote in place, and a
  truncated download "exists" to every gate after it.

`downloadNcbiGff.test.sh` pins both against a stub curl. The UCSC side needs
none of this: `ucsc2jbrowse/downloadNcbiGff.sh` rebuilds from a fresh `datasets`
zip whenever it fetches, and its 72 GFFs surveyed clean the same day.

### A GCA hub's gene search comes from xenoRefGene

GCA hubs get no NCBI GFF, so the text index above never covers them. 7,885 of
them carry UCSC's `xenoRefGene` bigBed, RefSeq mRNAs from other species aligned
to the assembly and named only by accession. `xenoSymbolIndex.sh` joins those
accessions to symbols cut from NCBI's `gene2refseq.gz` and writes
`trix/<accession>.ix` in `jbrowse text-index`'s record format, one record per
symbol per overlapping cluster, indexing the symbol only. The config gets the
same `trixAdapter` entry a GCF hub gets, so every JBrowse release that searches
a GCF hub searches these.

- **The index is built before the config**, and `buildConfigsBatch.ts` adds the
  entry only when the index exists, so a hub whose bigBed failed to fetch has no
  search rather than a broken one.
- **The bigBeds are an rsync mirror** (`genark2jbrowse/xenoRefGene/`, ~2 GB).
  `rsync -t` over the daemon, 4,000 paths a connection, skips a file whose size
  and mtime match and keeps upstream's mtime on the copy, so UCSC sends each
  bigBed once and then only what it changed. A hub is rebuilt when its index is
  older than its mirrored bigBed or the symbol table, so a symbol refresh and
  `--reprocess-all` read the mirror and ask UCSC for nothing.
- **The symbol table is refreshed every 30 days** (`refseqSymbols/`, 4 minutes
  and 2.4 GB streamed from NCBI), and a refresh rebuilds every index.

## A hub.txt is refreshed by rsync, not fetched once and kept forever

`downloadHubs.ts` fetched a hub's `hub.txt` the first time the assembly list
named it and never again outside `--reprocess-all`, so whatever UCSC later did
to that hub — renamed labels, a RepeatMasker track switched to `bigRmsk`, a new
liftOver chain to a sibling assembly — never reached its config. Measured
2026-09-01: 18,846 of 52,720 upstream `hub.txt` files carried an mtime newer
than our copy, and of 12 sampled 3 differed in content; the first full sync
changed 278 of them in content.

Three steps in `genark2jbrowse/make.sh`, a few dozen rsync connections in total,
because 52,000 HEAD requests against hgdownload is the kind of load the
track-url canary is budgeted to avoid:

- **`listUpstreamHubs.sh`** answers, for every hub, the size and mtime of
  `hub.txt` and whether the `2bit` and `chrom.sizes.txt` are there. It refuses a
  listing under 10,000 hubs: a truncated one would read as "every hub retired".
  `listUpstreamHubs.test.sh` pins the parser, the refusal and the dispatch
  below.

  It used to walk `rsync://hgdownload.soe.ucsc.edu/hubs/GCA/` and `GCF/` with
  `--list-only` and an include chain descending exactly four levels — 52,720
  hubs in 631 s, and 775 s when re-measured. That walk is still in the file as
  `walk_upstream_hubs`, because it needs nothing from upstream but the rsync
  daemon itself; `HUB_LIST_MODE=walk` forces it and the default falls back to it
  automatically. What replaced it: hgdownload publishes
  **`hubs/genArkFileList.txt.gz`**, a daily manifest of all 2.07M paths under
  `hubs/GCA` and `GCF` (10.5 MB, downloads in 0.15 s), so the accessions are
  known without walking anything and `rsync --files-from` is asked to stat only
  the ~158,000 paths we read. **13 s against 775 s.**

  Three measurements are why, and the first is the one that generalises. The
  walk's cost is hgdownload reading ~110,000 directories it then discards, and
  it is almost entirely **cache**-bound, not work-bound: the same GCA walk is
  68.8 s cold and 1.85 s warm, 37×, with 0.49 s of that on our side. Statting
  named paths barely moves — the same GCF/002 stat is 0.547 s cold and 0.532 s
  warm. And **parallelising the walk is not the fix**: four concurrent cold
  walks moved 188 hubs/s against 117 single-stream (~1.2× for 3× the
  connections, once the one subtree that came back warm is excluded), because
  the server is throughput-bound rather than latency-bound.

  Two things about the replacement are load-bearing. **`--files-from` must be
  chunked** — rsync's handling of it is quadratic in the list length, so the
  whole corpus in one call spends **74.8 s of client CPU** against 8 s of wall
  clock in chunks of 4,000; the fast version was slower than the walk until that
  was found. And **the manifest proposes candidates, it does not answer**:
  `src/upstreamHubCandidates.ts` unions its accessions with our own `hubs/` tree
  (so a hub gone upstream still gets a stat, which is the "gone upstream"
  finding) and with the assembly list (so a hub added in the last day is not
  reported as never having existed), and rsync's `--ignore-missing-args` makes a
  path that is not there simply absent from the output. Nothing downstream reads
  a stale answer, because nothing downstream reads the manifest.

  Verified 2026-09-04 against a full walk taken the same hour: the 52,722
  `hub.txt` rows are **byte-identical**, the new listing invents nothing, and
  both consumers agree exactly (`staleHubTxt.ts` identical output; the
  `downloadHubs.ts` verdicts identical, 24 gone and 0 missing-sequence). The
  only rows the walk had are 1,221 `<acc>.repeatModeler.2bit` and one
  `<acc>.chrNames.2bit`, which matched its `*.2bit` glob and which no consumer
  looks for — `downloadHubs.ts` asks for `<accession>.2bit` by name.

- **`src/staleHubTxt.ts`** prints the paths whose local size or mtime differs
  from the listing, and `rsync -t --files-from` copies exactly those. `-t`
  leaves upstream's mtime on the copy, so the comparison is exact from then on
  and needs no stamp file; a fresh checkout, whose mtimes are checkout times,
  costs one full copy (all 52,720 in 890 s) and is exact after it. `git status`
  on `hubs/**/hub.txt` then says which changed in **content**, and those hubs
  lose their `liftOver/.checked` so the chain probe runs again for them — a
  refreshed `hub.txt` is how a new chain gets noticed at all.
- **`downloadHubs.ts`** fetches only hubs with no `hub.txt` yet, and reports two
  things the assembly list cannot say: every accession it names that the listing
  did not find, and every hub whose `2bit` or `chrom.sizes.txt` is gone. The
  first is split by whether we publish a config for it, because UCSC's
  `assemblyList.json` names 23 hubs that have never existed on hgdownload (404
  on both hosts, absent from rsync), and those are noise; a hub we have and
  upstream no longer does is the finding, and it is no longer fetched. The
  second is the GenArk half of the sidecar problem — `loadPre()` fails the whole
  assembly on either — answered from the same stat pass, not from the
  105k-request probe that the reverted mirroring sweep was.

The rsync daemon lags the web host by under an hour (192 files changed upstream
between the first listing and its copy, and were current on the next listing),
so a few "still stale" entries right after a sync are the window, not a bug.

A failed listing skips the refresh for that run and says so; nothing is deleted
on either evidence. That report is where **GCF_000001405.40** shows up: UCSC's
`assemblyList.json` still lists the GRCh38.p14 GenArk hub, but its directory is
gone from both hgdownload hosts (hub.txt, 2bit, `chrom.sizes` and every bigBed
404; the API says "genome not found"), so the config we publish for it cannot
open. The accession page is unaffected — it launches `/ucsc/hg38` — and the
synteny drilldown already routes around it, but the config is still at its
permanent url, in `processedHubJson` for Desktop, and is the liftOver target of
other hubs' synteny tracks. Retiring or re-pointing it is a decision this report
keeps visible rather than one the pipeline makes.

## `hubs/` stays in git, and nothing depends on its history

The 52,720 GenArk configs (260k tracked files, 1.5 GB at HEAD) are committed on
purpose: `git diff` after a run is the one place that shows _what_ changed in
which hub, and it is what a converter change is checked against before it is
shipped. Measured 2026-09-01, git is not the cost it looks like — `git status`
1.4 s, `git diff --stat hubs/` 4.8 s — and what grew the repo to 1.2 GB on
GitHub was not the per-run traffic (1 to 100 hubs) but corpus-wide rewrites,
four of which in late August were the formatter reflowing what the pipeline
wrote. The one-pass builder writes oxfmt's format directly, so those are gone.

What made the history precious was one date: the recently-updated page needed to
know when each hub first appeared, and the only record was the commit that added
its config, so `generateRecentlyUpdated.ts` walked `git log -- hubs/` (1.2M
lines) and run.sh had to commit `hubs/` before the website build could run.
**`genark2jbrowse/hubFirstSeen.json`** is that record now: accession to the ISO
time of the run that first built its config, seeded once from the git log on
2026-09-01, appended to by `buildConfigsBatch.ts` for any accession it lacks
(never under `--out-root`), and committed beside `hubs/` by run.sh. It is
written with `formatJson` like the configs, so an ordinary run adds one line per
new hub and reflows nothing.

That leaves the history with no reader. Squashing it, or moving `hubs/` and
`ucsc2jbrowse/configs/` into a sibling data repo when the size does become a
problem, costs nothing the website or the pipeline reads. A manifest of hashes
instead of the files was considered and rejected: it says which hubs changed and
not what changed in them, and the second half is the one that catches a
converter regression.
