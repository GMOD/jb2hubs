---
name: ucsc-pipeline
description:
  'How ucsc2jbrowse decides what to rebuild, builds every config in one pass,
  picks minimal-config tracks and detects NCBI-derived assemblies, with the
  incidents behind each gate.'
---

# The UCSC pipeline

Moved out of the root `CLAUDE.md` on 2026-10-08, which keeps the rules. Dated
measurements and incidents read as written at the time.

## A converter change invalidates every UCSC config, and make.sh knows it

`ucsc2jbrowse/make.sh`'s incremental gate stamps **two** hashes per built
assembly, and reprocesses when either differs: `.trackdb_hash` (the content of
`trackDb.txt.gz`, i.e. the data) and `.pipeline_hash` (`source_tree_hash` over
the converter itself, i.e. the code). Only the first existed until 2026-08-06.

That is not a theoretical gap. `getTrackModifications` runs inside
`addMetadata.ts`, which make.sh only invokes for assemblies the gate marked
changed — so `24cbca057b6`, which exempted hg19's CRG/Duke mappability bigWigs
from the `wgEncode` drop rule, was followed by a `./run.sh` that logged
`No UCSC assemblies have changed`, regenerated nothing, and shipped the same
configs. The line reads like success, which is what made it cost a day. There is
no downstream gate that could have caught it either: `check-plugin-urls`,
`check-sidecar-urls` and `check-config-compat` all validate the config that
exists, not the one the current code would produce.

Two things to know when changing this:

- **The `PIPELINE_SOURCES` list in make.sh is deliberately broad** — every
  `ucsc2jbrowse/*.sh`, `src/`, `ucscExtensions/`, `ucscRenames/`, `lib/` and
  `hubtools/src`. The error directions are not symmetric. Over-invalidating
  costs one reprocess, and a reprocess is cheap on a warm tree: the per-file
  derivations are `needs_rebuild`-gated, so only the configs are actually
  re-derived. Measured 2026-08-06 by reprocessing hg19 alone, the worst
  assembly: 2m40s for the whole `make.sh` run, of which hg19's own Phase 2 was
  67s and the text-index passes were 10s and 23s. Under-invalidating ships wrong
  configs indefinitely. Add new inputs to the list rather than reasoning about
  whether they matter.
- **`.pipeline_hash` is written on every mode**, including `--reprocess-all` and
  `--skip-download`, unlike `.trackdb_hash`. Whatever else those modes skip, the
  code that just built the configs is the code in the tree; not recording it
  would make the next incremental run reprocess all 238 again.

`source_tree_hash` lives in `lib/common.sh` (tested by `lib/common.test.sh`). It
keys on paths relative to the repo root so the hash survives a different
checkout location, excludes `*.test.*` (a test cannot change what a build
emits), and errors on a path that does not exist so a rename fails loudly
instead of silently dropping a tree from the hash.

### The same blind spot exists one level down, in `needs_rebuild`

`needs_rebuild` stamps the source _table_, so it cannot see a change to the code
that converts it. `encodeGffAttribute` learned to escape control characters and
dm6's and droPer1's `ncbiRefSeq.gff.gz` sailed through a full reprocess still
holding raw carriage returns, because their golden-path tables had not moved;
both had to be cleared by hand. `DERIVATION_HASH` in `ucsc2jbrowse/make.sh`
closes it: when it differs from `$UCSC_BUILT_DIR/.derivation_hash`, make.sh
exports `REDERIVE=1` and `needs_rebuild` rebuilds regardless of the table.

Two properties hold this together, and breaking either is silent:

- **`DERIVATION_SOURCES` must stay a subset of `PIPELINE_SOURCES`.** A change to
  the derivation code therefore also moves `PIPELINE_HASH`, which marks every
  assembly changed, which is what actually puts the derivation scripts in front
  of every file. Without that containment `REDERIVE` could fire on a run that
  visits only some assemblies, and the stamp written at the end would claim the
  rest were re-derived too. This is why `bed2gff/src` is in **both** lists.
- **An absent stamp bootstraps rather than re-deriving.** The code that produced
  what is already on disk is unknowable, and assuming the worst would spend
  hours re-deriving every bed/gff/rmsk file on an unrelated run. Recording the
  current hash makes every _later_ change detectable, which is the property that
  was missing. The cost of the bootstrap is one blind spot for outputs built
  before 2026-08-06; the alternative was a permanent one.

### genark2jbrowse has no such gate any more, because nothing it guards is expensive

Until 2026-09-01 genark's "new" mode meant "this accession has no hub.txt yet",
so an existing hub's config was never regenerated and a converter change reached
none of the 52,000 until someone remembered `--reprocess-all`; a repo-level
`.pipeline_hash` escalated the run to "all" when the code moved, and the work
list for a run lived in a `mktemp` that a crash deleted.

All of that existed to avoid rebuilding configs, and a config build is 17
seconds for the whole corpus now (see the one-pass section below). Every other
phase is gated per file — a GFF is downloaded when absent and processed when
newer than its output, genetic codes derived when the sidecar is missing, chain
files probed once per hub, text indexed when older than the GFF — so a run
simply visits every hub, every time, and rebuilds what is stale. `--all` is
accepted and changes nothing; `--reprocess-all` still forces everything.

### `--explain` answers what a run would do, before it does it

Every ucsc gate above is a pure predicate over local stamps, so
`ucsc2jbrowse/make.sh` takes `--explain`: it runs the gates, prints the verdict
and the reason, and exits without fetching, writing or building anything. It is
`make -n` for a pipeline that is not a Makefile, and it exists because the gates
are only readable by running them — the hg19 mappability regression cost a day
partly because `No UCSC assemblies have changed` reads like success, and there
was no way to ask the question first.

Two properties are what make it worth trusting, and both are easy to break:

- **It calls the code the run calls.** `detect_changed_assemblies` and
  `would_rsync` in `ucsc2jbrowse/make.sh` were extracted so the report and the
  build share one implementation; `explain_stamp` (`lib/common.sh`) only renders
  a comparison the caller has already decided into `REDERIVE` or `MODE`. A
  second copy of any of that would be a model of the run rather than the run,
  and would be most confident exactly when it had drifted.
- **It says what it cannot know.** The report is exact on the code half and
  as-of-last-rsync on the data half, because a real run syncs first, and says so
  rather than implying a precision it does not have. It also lists what runs
  regardless — Phase 3 onward always does — so a clean report reads as "nothing
  is rebuilt", not "nothing happens". genark's `--explain` has nothing to
  predict and says that instead.

Answers grouped by reason, not one line per assembly: a converter change marks
all ~240 stale for the same reason, and the ungrouped form buries the two that
actually got new data.

## A UCSC config is built in one pass, from scratch, on every run

`ucsc2jbrowse/src/buildConfigs.ts` rebuilds `config.json`, `minimal.json` and
`config-staging.json` for **every** assembly the genome list names, in memory,
from the files the earlier phases leave beside it — `tracks.json`, the derived
`*.bed.gz`/`*.gff.gz`, `gff/<db>.gff.gz`, the GENCODE files, `liftOver/*.pif.gz`
— plus a live `hub.txt` fetch for the 17 hub-backed entries. Each file is
written only when its text changed, in the format `pnpm format` would produce.
The whole walk is under two minutes for 238 assemblies, most of it hg38's 32 MB
`tracks.json`.

Until 2026-09-01 the same config was assembled by ~14 separate read-modify-write
passes (23 on hg38) spread over three `make.sh` phases — `createAssembly`, the
big-file merger, two tabix adders, `removeEverythingButLatest`, two
`jbrowse text-index` passes, extensions, `jbrowse add-track` for the NCBI GFF
and seven GENCODE files, chain tracks, metadata, name suffixes, renames,
enhance, genetic codes, then the six-step finalize walk — and most of them ran
only for "changed" assemblies, which is how a converter fix could ship to none
of them (the hg19 mappability incident above). Rebuilding every config every run
is what closes that class for good: the `.pipeline_hash` gate now decides only
which assemblies get their **track files** re-derived, never which configs are
current.

The step order in `STEPS` is the order the passes used to run, because that
order is what every published config's key order is; the adjacencies that are
load-bearing are listed at the top of the file. **Add a step by putting it in
`STEPS`, and say whether its position matters.** A step takes a
`FinalizeContext` (`src/utils/finalizeStep.ts`), mutates `ctx.config` in place,
and returns counters for the run summary; it never reads or writes `config.json`
itself. `--out-root <dir>` writes the three files there and touches nothing
else, which is what makes the diff below cheap.

Three things moved on purpose:

- **Text indexing runs after the config is written** (`textIndex.sh`, over the
  assemblies `textIndexPlan` reports as missing an index or holding one older
  than its sources). `jbrowse text-index` reads the NCBI GFF track's indexing
  policy off its `textSearching` slot, and the old order indexed a freshly
  generated config before enhance had put the policy on it. The index is named
  after the config's assembly, which for a GenArk-backed alias is the accession:
  looking for `trix/<db>.ix` instead is why rn8 was re-indexed on every run.
- **The NCBI GFF and GENCODE files are hard links** into the built dir, matched
  by inode, not `jbrowse add-track --load copy` copies remade on every
  reprocess.
- **Staging is an in-memory second enhance** (`stagingEnhanceOptions` in
  hubtools), not a copy plus a re-run with env set.

Verified on 2026-09-01 by building all 238 into a scratch tree and diffing
against the committed `configs/` and `configs-minimal/`: 230 of 238 configs
byte-identical once the `indexingFeatureTypesToInclude` list hubtools stopped
writing on 2026-08-28 is dropped from the committed side, 4 identical apart from
top-level key order (they had never been through the fresh chain), and 4
differing in content that had moved upstream or was stale in git: hg38's trackDb
re-synced that morning, `cb1`'s first real build, `enhLutNer1`'s
never-regenerated plugin urls, and a hub whose `hub.txt` gained a field. The 230
`minimal.json` and 231 `config-staging.json` matched the same way.

## What belongs in `configs-minimal/`

`minimal.json` is a second, small config published beside every UCSC
`config.json` and named in the genome list as `jbrowseMinimalConfig`
(`src/transformGenomeList.ts`). `@cmdcolin/jbrowse-plugin-hubs` fetches it to
resolve a genome a synteny track references, so it is what the mate panel opens
with, and it is on the latency path of every cross-assembly launch. It is worth
keeping small — but small is a track-selection problem, not a metadata problem;
the trackDb prose in `metadata.ucsc.html` is 90% of its bytes and stays, because
it is what the track's About dialog shows.

`createMinimalConfig.ts` selects on two rules:

- **`MINIMAL_TRACK_PATTERNS`**, matched against a whole `trackId` segment —
  anchored at the start or just after a dash, never as a bare substring.
  Substring matching is what put every ENCODE regulation track in (`wgEncode`
  contains `gencode`, 82% of hg38's bytes), and what pulled `veGAPseudogene` and
  `cGAPSage` in under `gap`. `allGaps` needs its own entry because it is not a
  `gap` prefix; `dbSnp155ClinVar` is correctly **not** a `clinvar` one.
- **whatever the config's own `defaultSession` opens.** Not an extra pattern —
  the exception is derived from the session so the two cannot drift.
  `generateDefaultSessions.ts` picks the best gene track an assembly actually
  has (`ncbiRefSeq`, `ncbiRefSeqCurated`, `ncbiGene`, `refGene`, `ensGene`,
  `augustusGene`, `xenoRefGene`), and only the first three are names the
  patterns know. Every assembly predating ncbiRefSeq therefore used to open a
  track its minimal config had dropped — 134 of the 238, booting to an empty
  view: hg18/mm9 named `refGene`, danRer4 `ensGene`, the invertebrates
  `augustusGene` or `xenoRefGene`. The ordering that prevents this is now
  explicit: `generateDefaultSessions` precedes `minimalConfig` at the end of
  `src/buildConfigs.ts`, which documents why.

`enhLutNer1` is legitimately empty — it has no annotation to include. `cb1` and
`hgFixed` used to be counted beside it as "not assemblies at all", which was
half wrong and wholly an excuse; see the section on the two configs that named a
404 sequence.

`renames` used to be counted as a fourth, and was not an assembly at all: it was
a stray copy of `ucscRenames/hg38.json` (the trackId → new-name map, `"DELETE"`
sentinel and all) that had been swept up and processed as a config, leaving
`assemblies: [{}]` and four `unpkg.com` plugin urls frozen since 2025-08-11.
Deleted 2026-08-05. Two things let it persist, both now addressed — but the
first is structural and still worth knowing:

- **`configs/` was an append-only mirror.** `make.sh` copied
  `$UCSC_BUILT_DIR/<db>/config.json` to `configs/<db>.json` and never pruned, so
  a db that disappeared upstream left a config behind forever, still feeding
  `mergeAll`, `checkPluginUrls` and `checkConfigCompat`. Two things close that
  now, and the split between them is on **provability**:

  `prune_stray_configs` (`ucsc2jbrowse/common.sh`, called from make.sh's copy
  step for both directories) deletes a file only when it is **both** absent from
  the genome list **and** carries no `assemblies[0].name` — the same
  discriminator `checkPluginUrls.mjs` keys on, and exactly the shape of a
  swept-up rename map. That needs no judgement, so it does not ask.

  `pnpm check-orphan-configs` (`scripts/checkOrphanConfigs.mjs`, first in
  run.sh's `gate_configs`) fails the upload on the rest: a real, named config
  for a db UCSC no longer lists. **Retiring one stays manual** — these are
  permanent urls that published links and desktop installs keep naming, so it is
  a decision, not a cleanup.

  It walks the **built tree** as well as the two mirrors, and that half is the
  one that was missing. `uploadAll.sh` syncs `$UCSC_BUILT_DIR`, not `configs/`,
  so a `<db>/` directory there is served at `/ucsc/<db>/` whether or not a
  mirror of it survives — and every gate in this repo reads the mirror.
  `hgFixed` is the live proof: retired from `configs/` and from every walk that
  regenerates it on 2026-08-30, and `s3://jbrowse.org/ucsc/hgFixed/` has served
  it ever since. What it serves is a config with
  `"displayName": "undefined (hgFixed)"`, no tracks, a 2bit and a chrom.sizes
  that 404 so `loadPre()` rejects it outright, and four plugin urls on the
  frozen unversioned `/plugins/…/dist/` path that `checkPluginUrls.mjs`'s own
  `isLegacy` rule would reject if it could still see them. Deleting
  `$UCSC_BUILT_DIR/hgFixed` is what makes the next sync drop the prefix — except
  `liftOver/.checked` and `config.json.bak`, which the sync's `*.checked` and
  `*.bak` excludes leave behind, so clearing it outright takes an
  `rclone delete`.

  Both **refuse rather than act vacuously**: a genome list under 100 names, a
  missing or empty config directory, or no list at all is "could not run", never
  "no orphans". Getting that backwards would let one truncated fetch report the
  whole corpus as stray — and, in make.sh's case, delete it. run.sh reports the
  check's exit 2 separately from its exit 1 for the same reason.

  Both walks over `$UCSC_BUILT_DIR` — make.sh's copy step and
  `src/buildConfigs.ts` — also iterate the genome list's own keys rather than
  whatever directories happen to be there, so a stray `renames` cannot become a
  config in the first place. `hgFixed` was appended to both until 2026-08-30
  (below); the two directories now hold the genome list's 238 names and nothing
  else, and the built tree no longer has a `renames/` at all.

- **`mergeAll` deduped plugins on whole-object identity**, so the same plugin
  under two urls was two entries. `all.json` was asking PluginLoader to install
  each of the four plugins three times over. It now dedupes by name, preferring
  the canonical `latest/` path — see `mergePlugins` in `src/mergeAll.ts`. That
  list is also the one thing here that is a union rather than a copy of some
  assembly's, so `all.json` is now a `CONFIGS` entry in `checkConfigCompat.mjs`
  and gets booted: on the floor and `latest` only (26MB, and the merged plugin
  list is config content, identical on every host), from `$UCSC_BUILT_DIR` under
  `--local` so the pre-upload gate reads the file it is about to publish.
  Measured 2026-08-27: 10,968 tracks, 4 plugins, clean on both.

## Which UCSC assemblies are NCBI-derived is derived, not listed

A `<db>-ncbiRefSeqGff` track is the full-resolution NCBI RefSeq GFF3 — gene →
mRNA → CDS/exon with the real attributes — beside UCSC's own genePred-derived
`ncbiRefSeq` bigBeds. `downloadNcbiGff.sh` builds it, and until 2026-08-26 it
read a hand-written list of 11 dbs.

That list could only ever be stale, because the UCSC genome list is fetched
**live** on every `make.sh` run: a new assembly arrives with no repo change, and
so with no GFF. rn8 (GRCr8) is the case that showed it. It is a GenArk-backed
alias whose own `nibPath` spells out `GCF_036323735.1`, its refNames already
**are** that assembly's RefSeq accessions (`NC_086019.1`), and its GenArk twin
at `/hubs/genark/GCF/036/323/735/GCF_036323735.1/config.json` has carried a
`-ncbiGff` track since the day it was built. Nothing was hard about rn8; nobody
was prompted to edit the file.

`src/deriveNcbiAccessions.ts` answers the question instead, from three sources,
strongest first. Measured over the 238 assemblies in the live list on
2026-08-26:

- **`nibPath`** — a GenArk-backed alias names its own RefSeq accession
  (`hub:/gbdb/genark/GCF/036/323/735/GCF_036323735.1`). 16 dbs. Not a claim
  about an equivalent assembly; it _is_ the assembly the hub was built from, and
  all 16 have RefSeq-accession refNames.
- **`description`** — a native hub spelling it in prose. 1 db, `mpxvRivers`.
- **`hgFixed.asmEquivalent`** — UCSC's own equivalence table, which is already
  on disk (make.sh rsyncs all of `goldenPath/hgFixed/database`). 58 dbs,
  including the old golden-path assemblies that predate GenArk.

Union: 75, every one of which has an NCBI annotation (checked against
`datasets summary`; 42 are `suppressed`, which is normal for a superseded
assembly and does not stop the download). 1.35GB of GFF for the whole set.

**Only a GCF counts.** 55 entries name a `GCA_` in `sourceName` — hg38's is
`GRCh38 … (GCA_000001405.15)` — and that is the GenBank submission, whose seqids
(`CM000663.2`) are not the ones a RefSeq GFF uses. Reading it would attach an
annotation that resolves to nothing.

### The curated file is now the override layer, and four of its rows are load-bearing

`ncbiRefSeqAccessions.tsv` still wins over anything derived, and `-` as the
accession turns a db off. Deleting it would not be a no-op: **hg38, hg19, mm39
and hs1 have no `ucsc`↔`refseq` row in `asmEquivalent` at all**, and the only
accession their genome-list entry names is the GCA. Nothing detects them; the
four assemblies people actually open would lose their GFF. The other seven rows
(ce11, danRer11, dm6, mm10, rn6, rn7, sacCer3) are recovered by `asmEquivalent`
and kept only because a curated pick should beat a derived one where they ever
disagree — today they agree on every one.

### `import.meta.main` is false for a `.ts` entry point, and it cost every GFF track

`lib/common.sh` exports `NODE_OPTIONS=--experimental-strip-types`, so every
`node src/*.ts` here runs type-stripped. Under that, **`import.meta.main` is
`false`** on node 24.2.0 (it is `true` for a `.mjs` entry point). The CLI block
at the foot of `deriveNcbiAccessions.ts` was guarded on it, so the block never
ran: the script wrote nothing and exited **0**.

`downloadNcbiGff.sh` then read an empty accession list and logged
`0 assemblies detected as NCBI-derived.` — a line that reads like a count, not a
failure — and added no `-ncbiRefSeqGff` track to any of the 238. Measured
2026-08-27: **zero** such tracks existed in the whole corpus, while 11
assemblies still held the GFF a pre-refactor run had downloaded, referenced by
nothing. The exit 0 is why `set -euo pipefail` never saw it.

Two things came out of that, and both generalize:

- Use `process.argv[1] === fileURLToPath(import.meta.url)`, which is what
  `mergeAll.ts` and `removeEverythingButLatest.ts` already do and which is
  verified to work under stripping. `deriveNcbiAccessions.ts` was the only file
  in the tree using `import.meta.main`.
- **A derivation over hundreds of inputs that yields zero refuses now.** The
  emptiness gate in `downloadNcbiGff.sh` exits 1 rather than proceeding, on the
  same principle as `prune_stray_configs` and `check-orphan-configs`: an answer
  of "none" from an input of 238 is a broken run, not an empty answer.

### Two gates, because a GFF whose seqids resolve to nothing is worse than no GFF

A track that loads and draws nothing reads as "this assembly has no NCBI
annotation". Both gates are local reads; neither costs a request.

- **Addressability, before the download** (`hasRefSeqAliases`). The GFF's
  `NC_`/`NW_` seqids reach refNames only through the assembly's chromAlias, and
  `database/chromAlias.txt.gz` says outright whether UCSC knows the RefSeq names
  — it is `(alias, chrom, source)` triples and the source column reads `refseq`,
  `ensembl`, `genbank,ensembl`. cavPor3 has a refseq row; **oryCun2, musFur1 and
  loxAfr3 do not**, and are dropped despite being in `asmEquivalent`. `aptMan1`
  is dropped too, for a different reason worth knowing: its refNames _are_
  RefSeq accessions, under UCSC's dot-to-`v` mangling (`NW_013995860v1`), and it
  publishes no alias table to undo that with. Hub assemblies skip this gate —
  they have no rsync'd `database/` dir and do not need one.
- **Overlap, after the download** (`seqidsResolve` in
  `src/addNcbiRefSeqGffTrack.ts`). `tabix -l` against the assembly's refNames
  and aliases, which answers the question a _partial_ `asmEquivalent` match
  leaves open — galGal6 matches 455 of 464 sequences, rn6 and oryCun2 less. Zero
  overlap skips the add-track; the GFF stays cached, so the next run re-checks
  it for free.

Not being able to answer is deliberately not the same as answering no. A hub
assembly on a cold tree has nothing mirrored beside its config yet, and refusing
there would withhold the track from every GenArk-backed alias on its first build
— the exact case the detection exists to serve. It says so and proceeds.

`<db>-ncbiRefSeqGff` matches `ncbirefseq` in `MINIMAL_TRACK_PATTERNS`, so a
newly detected assembly's GFF lands in its `minimal.json` as well. That is the
existing behaviour for the 11, not a new decision.

## multiWig composites, table-backed big files, and ENCODE

A UCSC `container multiWig` composite converts to a single
`MultiQuantitativeTrack` whose `MultiWiggleAdapter` has one subadapter per
subtrack, rather than to N tracks (`ucsc2jbrowse/src/mergeMultiWigTracks.ts`).

A `type big*` track with no `bigDataUrl` keeps its file path in the golden-path
table named by its `table` setting, which `src/resolveTableBigFile.ts` reads
from the rsynced `database/` dir (`buildConfigs.ts` hands `addBigDataTracks` the
`dbDir` for this). Without it the legacy ENCODE regulation composites never
convert, which on hg19 means no regulation signal tracks at all, since ENCODE 4
is hg38-only. The aggregate carries `metadata.multiWigContainer`, which exempts
it from the too-many-tracks drop rules in `getTrackModifications.ts` — it is one
track, and for the ENCODE ones its trackId would otherwise match the `wgEncode*`
rule.

ENCODE's individual-experiment composites (12,729 subtracks on hg38) stay
dropped. `agent-docs/reference/ENCODE_TRACKS.md` records why, what was measured,
and what would have to come first (UCSC's own faceted metadata TSVs) if they are
ever loaded as connections.

## The UCSC genome list timestamps itself, and that rebuilt the website every run

`api.genome.ucsc.edu/list/ucscGenomes` stamps every response with the time of
**your request**:

```
"downloadTime": "2026:09:10T00:00:14Z", "downloadTimeStamp": 1788998414,
"dataTime": "2026-08-18T15:38:37",      "dataTimeStamp": 1787092717,
```

`dataTime` is the real data clock and is stable; `downloadTime` is not, so
make.sh's `curl > list.json.raw` writes different bytes on every run whether or
not UCSC moved anything — verified by fetching twice, two seconds apart, and
diffing at byte 39.

That file was being rsynced to the bucket, and the rclone changed-object count
is what gates **both** the `/ucsc/*` CloudFront invalidation and run.sh's
decision to rebuild the website. So every run invalidated, rebuilt astro,
shipped the 5.4GB tree and invalidated `/*` — and the branch that reads "No
genark/ucsc/website changes detected; skipping website build, deploy, and
CloudFront invalidation" **could never once fire**. Confirmed across the last 12
run logs: `list.json.raw: Copied` in every completed one, `ucsc=1` in every RUN
SUMMARY. On 2026-09-09 that was a 5.4GB deploy whose only input change was a
timestamp.

`list.json.raw` is now excluded from the sync, for the same reason
`.pipeline_hash` and `tracks.json` are: it is build state, nothing reads it from
the bucket, and `src/transformGenomeList.ts` turns it into the `list.json` that
is published, which drops the timestamps. The stale copy already in the bucket
stays — rclone leaves excluded objects alone on both sides.

The general shape is worth keeping: **anything synced whose bytes are a function
of the clock turns a change-gated deploy into an unconditional one**, and it
does so silently, because "changed" is exactly what the pipeline is built to act
on.

## A derivation phase that prints nothing is indistinguishable from a hung one

`createBedTracksForGoldenPath.sh`'s `process_assembly` emitted no output at all,
and `PARALLEL_OPTS` correctly drops `--bar` when stdout is not a terminal, so a
re-derivation run was a wall of silence. Recovered from the 2026-09-07 log: BED
tracks **37m56s**, RepeatMasker **8m14s**, gene tracks **9m40s**.

Recovered, because those three markers were not readable. `xxhsum` 0.8.1 writes
a 72-byte carriage-return progress line to stderr per invocation and has no flag
to stop it (`-q` is about benchmark and check mode). `detect_changed_assemblies`
already dropped it deliberately; `needs_rebuild`, `save_rebuild_stamp`,
`source_tree_hash` and the trackDb stamp did not — and those run per derived
file. The result was a **single 297,917-character line** of 8,275 CR segments,
and since a CR segment ends without a newline, the `log` lines that followed
were appended onto it: `[09:33:41] Creating RepeatMasker tracks...` was inside
that line, invisible to `grep '^\[2026'` and to anyone scrolling. Three of the
last eight run logs have a ~298KB line like it. All four call sites now drop
that stderr; a failed hash still reads as "changed" and rebuilds, which is the
safe direction, and `save_rebuild_stamp`'s pipefail still fails the job.

`run_for_assemblies` and `run_for_assemblies_lenient` now share one body with a
`--joblog`, and print one line per phase naming the assemblies that dominated
it. Verified against real `parallel` in all four combinations of strict/lenient
× success/failure; `ucsc2jbrowse/common.test.sh` pins that the lenient runner
survives, names the failing assembly and reports timing, and that the strict one
still aborts under `set -e`.

## UCSC hubs vs GenArk aliases (two-flavor configs)

The UCSC genome list is fetched **live** from
`api.genome.ucsc.edu/list/ucscGenomes` on every `ucsc2jbrowse/make.sh` run, so
new UCSC assemblies can appear (and break the pipeline) without any repo change.

Hub-backed entries (`nibPath` starts with `hub:`) come in two shapes, and
`buildConfigs.ts` (`hubUrl`) derives the `hub.txt` URL from `nibPath`, not the
assembly name:

- native UCSC assembly hub (e.g. `hs1`, `mpxvRivers`): `hub:/gbdb/<db>/hubs` →
  `/gbdb/<db>/hubs/public/hub.txt`
- **GenArk-backed alias** (e.g. `rn8` = GRCr8): `hub:/gbdb/genark/<GC[AF] path>`
  → `/hubs/<GC[AF] path>/hub.txt` (served from `/hubs/`, not `/gbdb/genark/`)

A GenArk-backed alias has no golden-path `liftOver/` directory; UCSC publishes
its chains only in the GenArk hub. So `addChainTracks`
(`src/createChainTracks.ts`) names the PIFs the GenArk twin's committed config
already lists, by absolute `jbrowse.org/hubs/genark/…` url, instead of building
a second copy. That makes the UCSC build read `hubs/`, so genark `make.sh` has
to run first, which run.sh does.

A UCSC assembly and a GenArk assembly can be the **same biological genome** and
both get a full config — this is intentional, not a bug. `buildUcscMapping`
(`mapAccessionsToUcsc` in `website/src/utils/ucscMapping.ts`) maps an NCBI
accession to a UCSC db name, and the accession page prefers the UCSC config
(`/ucsc/<db>/config.json`) when one exists, falling back to the GenArk config
otherwise. The mapping takes an accession (or its paired one) that the entry's
`sourceName` or description names; failing that, an entry of the same taxon
whose description spells the same assembly name, with a `.pN` patch suffix
dropped (`GRCh38.p14` → hg38, `GRCg6a` → galGal6). A shared accession base is
never enough: GRC keeps one base across major versions, and the old base
fallback sent GRCm38's `GCF_000001635.26` to mm39. When unsure it maps nothing,
which costs a launch of the GenArk config rather than a launch of the wrong
genome. So do **not** "dedup" GenArk aliases by pointing them at the GenArk
config — that would make them inconsistent with hg38/mm39/etc., and the
accession page relies on the `/ucsc/<db>/config.json` build existing.
