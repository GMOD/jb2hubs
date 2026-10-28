---
name: ucsc-pipeline
description:
  'How ucsc2jbrowse decides what to rebuild, builds every config in one pass,
  picks minimal-config tracks and detects NCBI-derived assemblies, with the
  incidents behind each gate.'
---

# The UCSC pipeline

## make.sh reprocesses every UCSC assembly when the converter changes

`ucsc2jbrowse/make.sh` stamps two hashes per built assembly and reprocesses the
assembly when either differs:

- `.trackdb_hash` hashes `trackDb.txt.gz`, the data.
- `.pipeline_hash` is `source_tree_hash` over the converter code.

make.sh wrote only `.trackdb_hash` until 2026-08-06. `getTrackModifications`
runs inside `addMetadata.ts`, which make.sh invokes only for assemblies the gate
marked changed. After `24cbca057b6` exempted hg19's CRG/Duke mappability bigWigs
from the `wgEncode` drop rule, the next `./run.sh` logged
`No UCSC assemblies have changed`, regenerated nothing and shipped the same
configs. That log line reads like success, so the bug cost a day. No downstream
gate could have caught it: `check-plugin-urls`, `check-sidecar-urls` and
`check-config-compat` validate the config that exists, and none of them builds
the one the current code would produce.

When changing the gate, keep two properties:

- **`PIPELINE_SOURCES` in make.sh is broad on purpose**: every
  `ucsc2jbrowse/*.sh`, `src/`, `ucscExtensions/`, `ucscRenames/`, `lib/` and
  `hubtools/src`. Over-invalidating costs one reprocess, which is cheap on a
  warm tree because `needs_rebuild` gates the per-file derivations and only the
  configs are re-derived. Reprocessing hg19 alone, the worst assembly, took
  2m40s for the whole `make.sh` run on 2026-08-06; hg19's Phase 2 took 67s and
  the text-index passes 10s and 23s. Under-invalidating, by contrast, ships
  wrong configs indefinitely. Add new inputs to the list without reasoning about
  whether they matter.
- **make.sh writes `.pipeline_hash` in every mode**, including `--reprocess-all`
  and `--skip-download`, which do not write `.trackdb_hash`. The code that built
  the configs in those modes is the code in the tree; without the stamp, the
  next incremental run would reprocess all 238 again.

`source_tree_hash` is defined in `lib/common.sh` and tested by
`lib/common.test.sh`. It keys on paths relative to the repo root, so the hash
stays the same in a different checkout location. It excludes `*.test.*`, since a
test cannot change what a build emits. It errors on a path that does not exist,
so a rename fails the run instead of dropping a tree from the hash.

### `DERIVATION_HASH` re-derives track files when the converter changes

`needs_rebuild` stamps the source table, so it cannot see a change to the code
that converts the table. When `encodeGffAttribute` started escaping control
characters, dm6's and droPer1's `ncbiRefSeq.gff.gz` still held raw carriage
returns after a full reprocess, because their golden-path tables had not
changed; both had to be cleared by hand. `DERIVATION_HASH` in
`ucsc2jbrowse/make.sh` closes that gap: when it differs from
`$UCSC_BUILT_DIR/.derivation_hash`, make.sh exports `REDERIVE=1` and
`needs_rebuild` rebuilds regardless of the table.

Two properties keep `DERIVATION_HASH` correct, and breaking either raises no
error:

- **`DERIVATION_SOURCES` must stay a subset of `PIPELINE_SOURCES`.** A change to
  the derivation code then also moves `PIPELINE_HASH`, which marks every
  assembly changed and so runs the derivation scripts over every file. Without
  that containment, `REDERIVE` could fire on a run that visits only some
  assemblies, and the stamp written at the end would claim the rest were
  re-derived too. For this reason `ucsc2jbrowse/src/genePredToGff.ts` is in
  both lists.
- **An absent stamp bootstraps instead of re-deriving.** Nothing records which
  code produced the files already on disk, and assuming the worst would spend
  hours re-deriving every bed/gff/rmsk file on an unrelated run. Recording the
  current hash makes every later change detectable. The bootstrap leaves one
  blind spot, for outputs built before 2026-08-06; the alternative was a
  permanent one.

**Advance `.derivation_hash` by hand only with an argument that covers the whole
corpus**, never on a spot check; without such an argument, take the
re-derivation (about an hour of CPU). The one sound case so far was
criGriChoV1's bed2gff fix on 2026-08-26 (`1e38bbbeb16ba674` →
`9a0a9f50214e5de1`). A wrapped record makes tabix reject the whole file, so any
output the fix would change had no index. Once criGriChoV1 was rebuilt, every
one of the 5,793 derived `.bed.gz`/`.gff.gz` files had an index, and bed2gff
feeds only the gene tracks, so re-deriving would have spent hours reproducing
byte-identical output.

`agent-docs/reference/GENARK_PIPELINE.md` explains why genark2jbrowse has no
such gate.

### `--explain` reports what a run would do

Every UCSC gate above is a pure predicate over local stamps, so
`ucsc2jbrowse/make.sh --explain` runs the gates, prints each verdict with its
reason, and exits without fetching, writing or building anything, like
`make -n`. Without it the gates could be read only by running them: the hg19
mappability regression cost a day partly because there was no way to ask before
a run.

Two properties make the report trustworthy, and both are easy to break:

- **It calls the code the run calls.** `detect_changed_assemblies` and
  `would_rsync` in `ucsc2jbrowse/make.sh` were extracted so the report and the
  build share one implementation; `explain_stamp` (`lib/common.sh`) only renders
  a comparison the caller has already turned into `REDERIVE` or `MODE`. A second
  copy would model the run, and the model would be wrong, with no error, exactly
  when the two had diverged.
- **It states its limits.** The report is exact on the code half and current as
  of the last rsync on the data half, because a real run syncs first, and the
  report says so. It also lists the phases that run regardless (Phase 3 onward),
  so a clean report reads as "nothing is rebuilt", not "nothing happens".
  genark's `--explain` has nothing to predict and says so.

The report groups assemblies by reason instead of printing one line per
assembly: a converter change marks all ~240 stale for the same reason, and one
line each would bury the two that got new data.

## Derivation skips tables the drop rules discard

Until 2026-10-20 `ucsc2jbrowse` derived, stored and uploaded 1,803 files (12.56
GB, mostly hg16–hg19) that no config names, because each belongs to a table a
rule in `getTrackModifications.ts` drops:

| rule                               | files |
| ---------------------------------- | ----- |
| trackId starts `encode`/`wgEncode` | 1,349 |
| `specializedParents`               | 237   |
| parent starts `pgSnp`              | 209   |
| `specializedTrackIds`              | 8     |

`src/keptTables.ts` runs each `tracks.json` key through the extension merge,
`withTrackDbMetadata` (shared with `addMetadata`) and the drop rules, and prints
the keys that survive. `derivable_keys` in `common.sh` filters the bed, gene and
rmsk derive loops by it, after `is_skipped_track`, which still covers `snp*`.
The gate removed exactly those 1,803 from the 5,788 files the loops visited, and
a scratch config build matched main's byte for byte. The files, their `.csi` and
`.hash` were deleted on 2026-10-20 after two gated runs left them untouched.

**Do not gate on whether a config names the file.** On 2026-08-27, 8 "orphans"
were `<db>.gff.gz`, the NCBI RefSeq GFF3, absent from configs because
`deriveNcbiAccessions.ts` emitted zero rows with no error. A gate keyed on
config membership would have deleted the evidence. The gate reads the drop
rules, never the config.

## `buildConfigs.ts` builds every UCSC config from scratch on every run

`ucsc2jbrowse/src/buildConfigs.ts` rebuilds `config.json`, `minimal.json` and
`config-staging.json` in memory for every assembly the genome list names. It
reads the files the earlier phases leave beside each config (`tracks.json`, the
derived `*.bed.gz`/`*.gff.gz`, `gff/<db>.gff.gz`, the GENCODE files,
`liftOver/*.pif.gz`) and fetches `hub.txt` live for the 17 hub-backed entries.
It writes each file only when its text changed, in the format `pnpm format`
produces. The walk takes under two minutes for 238 assemblies, most of it spent
on hg38's 32 MB `tracks.json`.

Before 2026-09-01, ~14 read-modify-write passes across three `make.sh` phases
assembled the config, and most of them ran only for "changed" assemblies, which
is how a converter fix could ship to none of them (the hg19 mappability incident
above). The `.pipeline_hash` gate now decides only which assemblies get their
track files re-derived; every config is rebuilt on every run.

The order of `STEPS` is the order the old passes ran, because that order is
every published config's key order; the top of the file lists the adjacencies
that matter. **Add a step by putting it in `STEPS`, and say whether its position
matters.** A step takes a `FinalizeContext` (`src/utils/finalizeStep.ts`),
mutates `ctx.config` in place and returns counters for the run summary; it never
reads or writes `config.json`.

`--out-root <dir>` writes the three files to `<dir>` and touches nothing else,
so diffing a scratch build is cheap. In that mode the builder reads
`fileAccessCache/` and `.mitoCodes.json` without writing them and probes no
file: the url check answers from the cache whatever its age, and keeps a url the
cache lacks.

The one-pass builder changed three behaviours on purpose:

- **Text indexing runs after the config is written** (`textIndex.sh`, over the
  assemblies `textIndexPlan` reports as missing an index or holding one older
  than its sources). `jbrowse text-index` reads the NCBI GFF track's indexing
  policy from its `textSearching` slot, and the old order indexed a fresh config
  before enhance had added the policy. The index is named after the config's
  assembly, which for a GenArk-backed alias is the accession; a check for
  `trix/<db>.ix` instead re-indexed rn8 on every run.
- **The NCBI GFF and GENCODE files are hard links** into the built dir, matched
  by inode, instead of `jbrowse add-track --load copy` copies remade on every
  reprocess.
- **Staging is a second enhance in memory** (`stagingEnhanceOptions` in
  hubtools), instead of a copy plus a re-run with env set.

On 2026-09-01 a scratch build of all 238, diffed against the committed
`configs/`, gave 230 byte-identical configs, 4 differing only in top-level key
order, and 4 differing in content that had changed upstream or was stale in git.

## What belongs in `configs-minimal/`

`minimal.json` is a small second config published beside every UCSC
`config.json` and listed in the genome list as `jbrowseMinimalConfig`
(`src/transformGenomeList.ts`). `@cmdcolin/jbrowse-plugin-hubs` fetches it to
resolve a genome a synteny track references, so the mate panel opens with it and
every cross-assembly launch waits on it. Keeping it small is a matter of track
selection. The trackDb prose in `metadata.ucsc.html` is 90% of its bytes and
stays, because the track's About dialog shows it.

`createMinimalConfig.ts` keeps a track by two rules:

- **`MINIMAL_TRACK_PATTERNS`**, matched against a whole `trackId` segment:
  anchored at the start or just after a dash, never as a bare substring.
  Substring matching put every ENCODE regulation track in (`wgEncode` contains
  `gencode`, 82% of hg38's bytes) and pulled `veGAPseudogene` and `cGAPSage` in
  under `gap`. `allGaps` needs its own entry because it does not start with
  `gap`; `dbSnp155ClinVar` correctly does not match `clinvar`.
- **The tracks the config's `defaultSession` opens.** The exception is derived
  from the session, so the two cannot disagree. `generateDefaultSessions.ts`
  picks the best gene track an assembly has (`ncbiRefSeq`, `ncbiRefSeqCurated`,
  `ncbiGene`, `refGene`, `ensGene`, `augustusGene`, `xenoRefGene`), and the
  patterns know only the first three. Before this rule, 134 of the 238
  assemblies opened a track their minimal config had dropped and booted to an
  empty view: hg18/mm9 named `refGene`, danRer4 `ensGene`, the invertebrates
  `augustusGene` or `xenoRefGene`. `generateDefaultSessions` therefore precedes
  `minimalConfig` at the end of `src/buildConfigs.ts`, and the code there says
  why.

`enhLutNer1`'s minimal config is empty because the assembly has no annotation to
include.

## A stray config: the append-only mirror and the plugin dedup

Until 2026-08-05 a stray copy of `ucscRenames/hg38.json` sat in
`configs/renames.json`, processed as a config with `assemblies: [{}]` and four
frozen plugin urls. Two things let it stay:

- **`configs/` was an append-only mirror.** `make.sh` copied
  `$UCSC_BUILT_DIR/<db>/config.json` to `configs/<db>.json` and never pruned, so
  a db that disappeared upstream left a config behind forever, still read by
  `mergeAll`, `checkPluginUrls` and `checkConfigCompat`. Two checks now close
  that, split by what each can prove:

  `prune_stray_configs` (`ucsc2jbrowse/common.sh`, called from make.sh's copy
  step for both directories) deletes a file only when the genome list lacks it
  and it has no `assemblies[0].name`. `checkPluginUrls.mjs` keys on the same
  field, and a swept-up rename map matches the test exactly. The test needs no
  judgement, so the function deletes without asking.

  `pnpm check-orphan-configs` (`scripts/checkOrphanConfigs.mjs`, first in
  run.sh's `gate_configs`) fails the upload on the rest: a real, named config
  for a db UCSC no longer lists. **Retiring one stays manual**, because
  published links and desktop installs keep naming these permanent urls, which
  makes retiring one a decision.

  The orphan check walks the built tree as well as the two mirrors.
  `uploadAll.sh` syncs `$UCSC_BUILT_DIR`, not `configs/`, so a `<db>/` directory
  there is served at `/ucsc/<db>/` whether or not a mirror of it survives, and
  every other gate in this repo reads the mirror. Retiring a db therefore means
  deleting its built directory too; `hgFixed` showed this
  (`agent-docs/reference/TRACK_URL_CHECKS.md`).

  `prune_stray_configs` and `check-orphan-configs` refuse to act on an empty
  input: a genome list under 100 names, a missing or empty config directory, or
  no list at all reports "could not run", never "no orphans". Otherwise one
  truncated fetch would report the whole corpus as stray, and make.sh would
  delete it. run.sh reports the check's exit 2 separately from its exit 1 for
  the same reason.

  The two walks over `$UCSC_BUILT_DIR`, make.sh's copy step and
  `src/buildConfigs.ts`, iterate the genome list's keys instead of the
  directories on disk, so a stray `renames` cannot become a config.

- **`mergeAll` deduped plugins on whole-object identity**, so one plugin under
  two urls made two entries, and `all.json` asked PluginLoader to install each
  of the four plugins three times. `mergePlugins` in `src/mergeAll.ts` now
  dedupes by name, preferring the canonical `latest/` path. The merged plugin
  list is the one part of `all.json` that is a union instead of a copy of one
  assembly's, so `all.json` is a `CONFIGS` entry in `checkConfigCompat.mjs` and
  gets booted. It boots on the floor and `latest` only (the file is 26MB, and
  the merged plugin list is config content, identical on every host), read from
  `$UCSC_BUILT_DIR` under `--local` so the pre-upload gate reads the file it is
  about to publish. On 2026-08-27 it held 10,968 tracks and 4 plugins and booted
  clean on both.

## `deriveNcbiAccessions.ts` decides which UCSC assemblies are NCBI-derived

A `<db>-ncbiRefSeqGff` track is the full-resolution NCBI RefSeq GFF3 (gene →
mRNA → CDS/exon with the real attributes), beside UCSC's genePred-derived
`ncbiRefSeq` bigBeds. `downloadNcbiGff.sh` builds it, and until 2026-08-26 it
read a hand-written list of 11 dbs.

A hand-written list falls out of date, because make.sh fetches the UCSC genome
list live on every run: a new assembly arrives with no repo change, and so with
no GFF. rn8 (GRCr8) showed it. rn8 is a GenArk-backed alias whose `nibPath`
spells out `GCF_036323735.1`, its refNames are that assembly's RefSeq accessions
(`NC_086019.1`), and its GenArk twin at
`/hubs/genark/GCF/036/323/735/GCF_036323735.1/config.json` has had a `-ncbiGff`
track since it was built. rn8 was easy to detect, and the list lacked it only
because no step prompted anyone to edit the list.

`src/deriveNcbiAccessions.ts` derives the answer from three sources, strongest
first, measured over the 238 assemblies in the live list on 2026-08-26:

- **`nibPath`**: a GenArk-backed alias names its RefSeq accession
  (`hub:/gbdb/genark/GCF/036/323/735/GCF_036323735.1`). 16 dbs. The accession is
  the assembly the hub was built from, not an equivalent one, and all 16 have
  RefSeq-accession refNames.
- **`description`**: a native hub that spells the accession in prose. 1 db,
  `mpxvRivers`.
- **`hgFixed.asmEquivalent`**: UCSC's equivalence table, already on disk
  (make.sh rsyncs only `asmEquivalent.txt.gz` from
  `goldenPath/hgFixed/database`). 58 dbs, including the old golden-path
  assemblies that predate GenArk.

The union is 75 dbs with 1.35GB of GFF in all, and `datasets summary` lists an
NCBI annotation for every one; 42 are `suppressed`, which is normal for a
superseded assembly and does not stop the download.

**Only a GCF counts.** 55 entries name a `GCA_` in `sourceName` (hg38's is
`GRCh38 … (GCA_000001405.15)`). That accession is the GenBank submission, whose
seqids (`CM000663.2`) differ from the ones a RefSeq GFF uses, so reading it
would attach an annotation whose seqids resolve to nothing.

### `ncbiRefSeqAccessions.tsv` overrides the derivation, and four of its rows are required

`ncbiRefSeqAccessions.tsv` wins over anything derived, and `-` as the accession
turns a db off. **hg38, hg19, mm39 and hs1 have no `ucsc`↔`refseq` row in
`asmEquivalent`**, and the only accession their genome-list entry names is the
GCA, so deleting the file would drop the GFF from those four. `asmEquivalent`
recovers the other seven rows (ce11, danRer11, dm6, mm10, rn6, rn7, sacCer3);
they stay so that a curated pick beats a derived one if the two ever disagree,
and today they agree on every one.

### `import.meta.main` is false for a `.ts` entry point, which dropped every GFF track

`lib/common.sh` exports `NODE_OPTIONS=--experimental-strip-types`, so every
`node src/*.ts` here runs type-stripped, and under stripping `import.meta.main`
is `false` on node 24.2.0 (it is `true` for a `.mjs` entry point). The CLI block
at the foot of `deriveNcbiAccessions.ts` was guarded on it, so the block never
ran: the script wrote nothing and exited 0.

`downloadNcbiGff.sh` then read an empty accession list, logged
`0 assemblies detected as NCBI-derived.` (which reads like a count, not a
failure) and added no `-ncbiRefSeqGff` track to any of the 238. On 2026-08-27
the corpus held zero such tracks, while 11 assemblies still held the GFF a
pre-refactor run had downloaded, referenced by nothing. `set -euo pipefail`
never caught the bug because the script exited 0.

Two rules came out of the bug:

- Use `process.argv[1] === fileURLToPath(import.meta.url)`, which `mergeAll.ts`
  and `gencodeTracks.ts` already use and which is verified to work under
  stripping.
- **A derivation over hundreds of inputs that yields zero refuses.** The
  emptiness gate in `downloadNcbiGff.sh` exits 1 instead of proceeding, as
  `prune_stray_configs` and `check-orphan-configs` do: an answer of "none" from
  238 inputs means the run broke.

### Two gates keep a GFF whose seqids resolve to nothing out of the config

A track that loads and draws nothing looks like "this assembly has no NCBI
annotation", which is worse than no track. Both gates read local files and send
no request.

- **Addressability, before the download** (`hasRefSeqAliases`). The GFF's
  `NC_`/`NW_` seqids reach refNames only through the assembly's chromAlias, and
  `database/chromAlias.txt.gz` states whether UCSC has the RefSeq names: it
  holds `(alias, chrom, source)` triples whose source column reads `refseq`,
  `ensembl` or `genbank,ensembl`. cavPor3 has a refseq row; **oryCun2, musFur1
  and loxAfr3 do not**, and the gate drops them although they are in
  `asmEquivalent`. The gate drops `aptMan1` for a different reason: its refNames
  are RefSeq accessions under UCSC's dot-to-`v` mangling (`NW_013995860v1`), and
  it publishes no alias table to map them back. Hub assemblies skip this gate,
  since they have no rsync'd `database/` dir and need none.
- **Overlap, after the download** (`seqidsResolve` in
  `src/addNcbiRefSeqGffTrack.ts`). The gate compares `tabix -l` against the
  assembly's refNames and aliases, which settles the case a partial
  `asmEquivalent` match leaves open: galGal6 matches 455 of 464 sequences, rn6
  and oryCun2 fewer. Zero overlap skips the add-track; the GFF stays cached, so
  the next run re-checks it without a download.

When a gate cannot answer, it proceeds instead of answering no. A hub assembly
on a cold tree has nothing mirrored beside its config yet, and refusing there
would withhold the track from every GenArk-backed alias on its first build,
which is the case the detection was written for. The gate logs that it cannot
check and proceeds.

`<db>-ncbiRefSeqGff` matches `ncbirefseq` in `MINIMAL_TRACK_PATTERNS`, so a
newly detected assembly's GFF goes into its `minimal.json` too, as it already
did for the 11.

## multiWig composites, table-backed big files, and ENCODE

`ucsc2jbrowse/src/mergeMultiWigTracks.ts` converts a UCSC `container multiWig`
composite to one `MultiQuantitativeTrack` whose `MultiWiggleAdapter` has one
subadapter per subtrack, instead of N tracks.

A `type big*` track with no `bigDataUrl` keeps its file path in the golden-path
table its `table` setting names, and `src/resolveTableBigFile.ts` reads it from
the rsynced `database/` dir (`buildConfigs.ts` passes `addBigDataTracks` the
`dbDir` for this). Without that lookup the legacy ENCODE regulation composites
never convert, which on hg19 means no regulation signal tracks, since ENCODE 4
is hg38-only. The aggregate track has `metadata.multiWigContainer`, which
exempts it from the too-many-tracks drop rules in `getTrackModifications.ts`: it
is one track, and for the ENCODE ones its trackId would otherwise match the
`wgEncode*` rule.

ENCODE's individual-experiment composites (12,729 subtracks on hg38) stay
dropped. `agent-docs/reference/ENCODE_TRACKS.md` records why, what was measured,
and what would have to come first (UCSC's faceted metadata TSVs) to load them as
connections.

## hg38's ALFA track range-reads NCBI's bigBeds

The `ALFA populations` step (`hubtools/src/alfaPopulations.ts`) adds one
`LinearMarkDisplay` scatter over NCBI's 12 per-population ALFA bigBeds to hg38.

- **NCBI serves each bigBed (about 19 GB)**, and the display reads it by range.
  `fetchSizeLimit` is 30 MB, which is comfortable at about 8 kb.
- **The urls name a dated release**, `ALFA_RELEASE` (`20260205170148`). A new
  NCBI release needs a new value there; the old directory may disappear.

## Some tracks open as a plot of one column

- **`hubtools/src/columnDisplays.ts`** puts a display first on gnomAD v4.1
  genomes and exomes (points at `AF` on a log axis, colored by `annot`) and on
  the GWAS Catalog (a Manhattan plot of `-log10(pValue)`, ruled at 5e-8). The
  derived `LinearBasicDisplay` stays second.
- **Two hg38 groups are one track with a row per file**: `hg38-longReadVariants`
  (17 cohorts) and `hg38-dbVar_common` (13), in `ucscExtensions/hg38.json`, each
  a `MultiWiggleAdapter` over the bigBeds drawn by
  `LinearMultiRowFeatureDisplay` with `rows.field: source`. A row loses the
  source track's mouseover, labels and filters.
- **Booted on main on 2026-10-26 and left as they were:** GTEx eQTLs by tissue
  drew every row in the default blue, ignoring their itemRgb, and the four MEI
  tracks merged the same way drew no features at all.
- **All of them use main's spellings**, waiting on v5.0.0-beta.18
  (`agent-docs/todo/beta18-joins-host-versions.md`).

## The UCSC genome list's timestamp rebuilt the website every run

`api.genome.ucsc.edu/list/ucscGenomes` stamps every response with the time of
the request:

```
"downloadTime": "2026:09:10T00:00:14Z", "downloadTimeStamp": 1788998414,
"dataTime": "2026-08-18T15:38:37",      "dataTimeStamp": 1787092717,
```

`dataTime` is the data clock and stays the same between fetches; `downloadTime`
changes, so make.sh's `curl > list.json.raw` writes different bytes on every run
whether or not UCSC changed anything. Two fetches two seconds apart differed at
byte 39.

The sync copied that file to the bucket, and the rclone changed-object count
gates both the `/ucsc/*` CloudFront invalidation and run.sh's decision to
rebuild the website. So every run invalidated, rebuilt astro, shipped the 5.4GB
tree and invalidated `/*`, and the branch that logs "No genark/ucsc/website
changes detected; skipping website build, deploy, and CloudFront invalidation"
never fired. The last 12 run logs all showed `list.json.raw: Copied` and
`ucsc=1` in the RUN SUMMARY. On 2026-09-09 the timestamp alone caused a 5.4GB
deploy.

The sync now excludes `list.json.raw`, as it excludes `.pipeline_hash` and
`tracks.json`: the file is build state, nothing reads it from the bucket, and
`src/transformGenomeList.ts` turns it into the published `list.json` without the
timestamps. The stale copy stays in the bucket, since rclone leaves excluded
objects alone on both sides.

**Anything synced whose bytes depend on the clock turns a change-gated deploy
into an unconditional one**, and no error reports it, because the pipeline acts
on whatever the sync reports as changed.

## Each derivation phase prints its own progress

`PARALLEL_OPTS` drops `--bar` when stdout is not a terminal, so each derivation
phase prints its own progress; without it, a running phase and a hung one look
the same in the log. A re-derivation on 2026-09-07 took 37m56s for BED tracks,
8m14s for RepeatMasker and 9m40s for gene tracks.

**Drop `xxhsum`'s stderr at every call site.** `xxhsum` 0.8.1 writes a 72-byte
carriage-return progress line to stderr per invocation and has no flag to stop
it (`-q` applies to benchmark and check mode). Run per derived file, those lines
joined into one 297,917-character line that hid the `log` lines after it from
`grep '^\[2026'`. `detect_changed_assemblies`, `needs_rebuild`,
`save_rebuild_stamp`, `source_tree_hash` and the trackDb stamp all drop it. A
failed hash still reads as "changed" and rebuilds, which is the safe direction,
and `save_rebuild_stamp`'s pipefail still fails the job.

`run_for_assemblies` and `run_for_assemblies_lenient` share one body with a
`--joblog`, and print one line per phase naming the assemblies that took most of
its time. Both were checked against real `parallel` in all four combinations of
strict/lenient × success/failure. `ucsc2jbrowse/common.test.sh` pins that the
lenient runner survives, names the failing assembly and reports timing, and that
the strict one still aborts under `set -e`.

## UCSC hubs and GenArk aliases (two-flavor configs)

make.sh fetches the UCSC genome list live from
`api.genome.ucsc.edu/list/ucscGenomes` on every run, so new UCSC assemblies can
appear, and break the pipeline, without any repo change.

Hub-backed entries (`nibPath` starts with `hub:`) come in two forms, and
`buildConfigs.ts` (`hubUrl`) derives the `hub.txt` URL from `nibPath`, not from
the assembly name:

- native UCSC assembly hub (e.g. `hs1`, `mpxvRivers`): `hub:/gbdb/<db>/hubs` →
  `/gbdb/<db>/hubs/public/hub.txt`
- **GenArk-backed alias** (e.g. `rn8` = GRCr8): `hub:/gbdb/genark/<GC[AF] path>`
  → `/hubs/<GC[AF] path>/hub.txt` (served from `/hubs/`, not `/gbdb/genark/`)

A GenArk-backed alias has no golden-path `liftOver/` directory; UCSC publishes
its chains only in the GenArk hub. `addChainTracks` (`src/createChainTracks.ts`)
therefore names the PIFs the GenArk twin's committed config already lists, by
absolute `jbrowse.org/hubs/genark/…` url, instead of building a second copy. The
UCSC build then reads `hubs/`, so genark `make.sh` has to run first, and run.sh
runs it first.

A UCSC assembly and a GenArk assembly can be the same biological genome, and
both get a full config on purpose. `buildUcscMapping` (`mapAccessionsToUcsc` in
`website/src/utils/ucscMapping.ts`) maps an NCBI accession to a UCSC db name,
and the accession page prefers the UCSC config (`/ucsc/<db>/config.json`) when
one exists, falling back to the GenArk config. The mapping takes an accession
(or its paired one) that the entry's `sourceName` or description names; failing
that, an entry of the same taxon whose description spells the same assembly
name, with a `.pN` patch suffix dropped (`GRCh38.p14` → hg38, `GRCg6a` →
galGal6). A shared accession base is never enough: GRC keeps one base across
major versions, and the old base fallback sent GRCm38's `GCF_000001635.26` to
mm39. When unsure the mapping returns nothing, which launches the GenArk config
instead of the wrong genome. Do **not** "dedup" GenArk aliases by pointing them
at the GenArk config: that would make them inconsistent with hg38/mm39/etc., and
the accession page relies on `/ucsc/<db>/config.json` existing.
