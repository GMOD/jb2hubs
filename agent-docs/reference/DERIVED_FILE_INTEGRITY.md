---
name: derived-file-integrity
description:
  'What keeps a derived .gz, its index, a PIF and a trix index trustworthy: the
  tabix and empty-file checks, the mitoCodes cache, the bgzip toolchain
  signature and the CLI version stamps.'
---

# Derived file integrity

## Checking that a derived file is complete, not only that it exists

`pnpm check-tabix-indexes` (`scripts/checkTabixIndexes.mjs`, in `gate_configs`)
requires a `.csi` or `.tbi` beside every derived `.bed.gz`/`.gff.gz`. The check
walks local files and sends no request, so unlike the two url checks it covers
GenArk too. On 2026-08-28 it read 50,476 files across both trees in 0.6s.

make's unit of work is the target file, so in a Makefile "the recipe ran" and
"the recipe's output exists" are one question. In these shell pipelines they are
two, and nothing asked the second: criGriChoV1 shipped a config naming an index
`tabix -C` had refused to write (`agent-docs/reference/TRACK_URL_CHECKS.md`).
`checkTrackUrls.mjs` caught it by probing urls; `check-tabix-indexes` catches
the same failure on disk, before the upload.

`save_rebuild_stamp` (`lib/derive.sh`) checks the output at the point of
derivation. It takes the output as an argument, in the same order as
`needs_rebuild` since the two are always called as a pair, and refuses to stamp
an output that is missing or empty. Without that check, a recipe that exits 0
having written nothing would be recorded as done and skipped by every later run.

`check-tabix-indexes` checks presence only. A fresh `.gz` beside an older index
also breaks a track (the bucket held that pair during the bgzip backend swap,
and a reader reports `invalid bgzf header`, not a missing file), but mtime
cannot detect it: 72 of the 5,856 UCSC files have an index whose mtime precedes
the data by up to 0.05 seconds, because bgzip and tabix finish inside one
filesystem timestamp. A tolerance wide enough for that would accept a real stale
index too. Three mechanisms prevent the stale pair instead:

- `assert_bgzip_toolchain` stops a backend change, the cause.
- `rclone_sync_with_indexes` orders the upload, which limits how long the bucket
  serves a mismatched pair.
- `install_indexed_gz` (`lib/derive.sh`), behind `write_indexed_gz` and
  `write_indexed_gz_from`, bgzips and indexes under a temp name and moves the
  pair in only when tabix accepts it, so a refusal leaves the old `.gz` and its
  index together.

## A `.gz` with an index and no records

`save_rebuild_stamp` refuses an output that is missing or empty, and
`check-tabix-indexes` requires an index beside it. A 28-byte `.gff.gz`, which
holds the BGZF end-of-file block and nothing else, passes both. Four of them had
shipped since 2026-06-03, each with a `.hash` recording it as built and a source
table full of rows: `galGal2` xenoRefGene (438,401 rows), `hg16`
encodeEgaspFullGenemark, `hg16` pseudoYale and `tetNig1` hoxGenes.

UCSC's data broke them in two ways, and each makes `bed2gff` fail. A failing
derivation also loses every gene track after it in that assembly, because
`process_assembly` in `createGeneTracksForGoldenPath.sh` runs under `set -e`.

- **Exons that run backwards.** 9 of galGal2's xenoRefGene rows have an
  `exonEnds` entry smaller than its `exonStarts` partner (`NM_017037`'s seventh
  exon is 2176615..2176258). That becomes a negative BED block size, which
  `BedRecord::parse` rejected with `Cannot parse field`, naming neither the row
  nor the file. `geneLike.ts` now drops such rows and reports how many, and the
  parse error includes the offending line.
- **Names with spaces.** hg16's `encodeEgasp*` tables put the GTF attribute
  verbatim in the `name` column (every transcript is
  `transcript_id "ENr231_1";`), and tetNig1's hoxGenes has a `CDS EVX-HOXA`. Two
  programs split those names on whitespace: `hck`, whose `--delimiter` defaults
  to `\s+`, so it built the isoforms file from the wrong columns, and bed2gff's
  `parallel_hash_rev`. The transcript then matched nothing in the isoforms map
  and `resolve_genes` exited 1. `hck` and `parallel_hash_rev` now split on tab.
  The name also goes into GFF3 column 9, where its `;` would end the attribute,
  so `writer.rs` percent-encodes the reserved set; it writes a value with no
  reserved character unchanged, which covers every ordinary gene in the corpus.

These files shipped for three months because nothing checked whether a derived
file holds any records. `find` over the built tree for `-size -100c` found the
four. Since 2026-10-12 `check-tabix-indexes` checks on every deploy: it
decompresses each file under 4 KB and fails one with no records, unless the UCSC
table it came from is empty too. On that date 8 files had no records, each a
`gap.bed.gz` whose `gap` table has no rows (wuhCor1, sacCer3, ce10, ce11,
bosTau9, gorGor5, droMoj1, eboVir3).

All three fixed files are in `DERIVATION_SOURCES`, so the fix reaches the corpus
by re-deriving every gene track. Claiming the output stays byte-identical
everywhere else would have needed an argument about names and coordinates across
a corpus nobody had scanned, which is the case where `.derivation_hash` is not
advanced by hand (`agent-docs/reference/UCSC_PIPELINE.md`).

## `mitoCodes.ts` caches a post-processing step that has no gate

A broad `PIPELINE_SOURCES` is the right trade because a reprocess is cheap on a
warm tree: `needs_rebuild` gates every per-file derivation.
`addMitochondrion.ts` had no gate and now runs for every assembly on every
config build, so without a cache each run would send a full round of NCBI eutils
queries plus one `chrom.sizes` fetch per assembly to hgdownload. Those fetches
would be unbudgeted, against the host `check-track-urls` is limited to 300
requests a day on.

`src/mitoCodes.ts` keeps the step cheap in two ways:

- **It caches the taxId → mito code answers** (`ucsc2jbrowse/.mitoCodes.json`,
  gitignored, 180-day TTL). It caches negatives too: `null` means "NCBI answered
  and this taxon has no MGCId", and without it every such taxon would be
  re-queried on every run. Only taxa in a chunk NCBI served may be cached as
  negative, because caching a failed request as an answer would suppress the
  genetic code until the TTL expired.
- **It reads `chrom.sizes` from the mirrored sidecar on disk.** This step runs
  before `mirrorAssemblySidecars` in `buildConfigs.ts`, and the builder rebuilds
  `config.json` from scratch on every run, so at that point the config names the
  upstream url again, although the previous run's mirrored file, which the
  builder does not rebuild, is beside it. `localChromSizesPath` asks
  `mirrorSidecars` for the naming rule instead of keeping a second copy of it.

On 2026-08-28, with hg38's and dm6's configs restored to their pre-finalize
state, a cold cache sent 2 NCBI queries and 0 hgdownload fetches, and a warm
cache sent none, with both configs reported already current. The run summary
prints those counts, so a regression to fetching shows up in the log.

Two scope decisions stand:

- **Track prose is out of scope.** The configs hold UCSC's trackDb html, which
  links ncbi, ebi, ensembl and a long tail of lab pages: ~700 urls of
  documentation, where a dead citation leaves the track working.
- **GenArk is out of scope**, for the reason the sidecar check excludes it:
  50,703 configs name ~150k upstream files, and probing them in bulk would
  repeat the reverted mirroring sweep.

## `assert_bgzip_toolchain` pins the compressor's output

`source_tree_hash` covers the repo's code and not the toolchain, and a derived
`.gz`'s bytes depend on the bgzip build as much as on the converter. htslib
1.23.1 linked against libz emits ~6% larger output than the same version linked
against libdeflate, with byte-identical decompressed content, so every content
check passes either way.

On 2026-08-27 a `~/.local` htslib upgrade (installed Aug 2, linking libz where
`/usr/bin`'s htslib 1.13 links `libdeflate.so.0`) swapped the backend with no
error. The next `REDERIVE` rewrote 5,757 files (76.7 GB) with no content change,
and `rclone -c` saw different bytes and re-sent all of them.
`rclone_sync_with_indexes` runs two passes, so the run left a fresh `.gz` beside
a stale `.csi` in the bucket for every assembly it reached. Production hg19 and
hg38 reported `invalid bgzf header`, with no pushed change to explain it.

`assert_bgzip_toolchain` (`lib/derive.sh`, called from both `make.sh` files
before any derivation) compares the bytes bgzip emits against
`BGZIP_TOOLCHAIN_SIGNATURE`. Three properties of it are required:

- **It compares output, not a version string.** `bgzip --version` read `1.23.1`
  before and after the swap.
- **The canary input is 2.4 MB of varied bed-like data**, which the check hashes
  in 0.09s per run. A short input hashes identically under htslib 1.13 and
  1.23.1, which both use libdeflate yet disagree on real files (243,569 against
  242,051 bytes on the same bed), so a small canary would pass the drift the
  check is meant to catch.
- **It is fatal.** The drift does not show in the output; it shows only as an
  unexplained multi-GB re-upload plus mismatched indexes, and a warning about it
  would scroll past. `ALLOW_BGZIP_DRIFT=1` accepts a deliberate change, which
  means committing the new signature and accepting that every derived `.gz` and
  `.csi` gets rewritten and re-sent.

The guard checks the host and the test checks the mechanism. Mixing the two up
cost three test suites: `lib/common.test.sh` used to fail unless the machine
running it matched the pin, which no CI runner can, since none has bgzip. The
workflow step was a plain list under `bash -e`, so that failure also stopped
`lib/chainpif.test.sh` and `genark2jbrowse/deriveGeneticCodes.test.sh` (then
named `addNcbiGffAndTextIndex.test.sh`), and neither had ever run in CI. The
suite now checks determinism, canary size, rejection of a different build and
the override, and reports the host's own match as information unless
`BGZIP_STRICT=1` (worth setting on the build box). The protection is
`assert_bgzip_toolchain` being fatal in both `make.sh` files before any
derivation, so the test lost nothing. The workflow step also runs every suite
and fails afterwards, so one red suite cannot hide the others.

If the guard fires: libdeflate levels are not comparable across htslib versions,
so no `-l` makes 1.23.1 reproduce 1.13 (l5→243,497, l6→242,051, l7→239,062).
Matching an existing corpus means matching the build. The corpus today is htslib
1.23.1 + libz, chosen for stability over the 6% size difference.

## The PIF corpus is keyed on the CLI that wrote it

A PIF's bytes depend on the version of `jbrowse make-pif` as much as on the
chain, and the format changed twice within the 5.0 betas.

`5.0.0-beta.1` (2026-08-31) added a coarse level-of-detail tier beside the
per-row CIGAR tier: the same alignments under uppercase `T<chr>`/`Q<chr>`
refnames, split at indels ≥ 10 kb, which the v5 adapter probes for and switches
to at `coarseBpPerPxThreshold` (10,000 bp/px). A v4 adapter queries `t<chr>` and
never reads the uppercase rows, so a regenerated PIF ships to production without
a staging sibling. On hg38→mm39 the build took 33 s and wrote 141.5 MB against
132.2 MB (+7 %), with 80,845 fine and 121,175 coarse row pairs.

`5.0.0-beta.2` (bumped here 2026-09-02) builds the coarse tier as a projection
of the alignments instead of a re-segmentation, and writes a header that
declares the layout. Measured on hg38→mm39 (80,845 PAF records, the same `.paf`
fed to both):

- **A coarse row is now its fine row without the CIGAR.** There are 80,845
  coarse rows against 80,845 fine, and comparing (refname, start, end, strand,
  target start, target end) across the two tiers finds zero differing rows.
  beta.1 emitted 121,175 coarse rows against the same 80,845 fine ones, 43,902
  of them with no fine row at those coordinates, so crossing
  `coarseBpPerPxThreshold` redrew the view with different segments. With beta.2
  the two tiers differ only in how many bytes a read costs.
- A leading `#pif` header line, in PAF tag syntax:
  `#pif  version:i:1  tiers:Z:fine,coarse  coarse:i:10000  cigars:Z:all`,
  declares the layout, so a reader need not probe for it. The line is a `#`
  comment, so tabix and `--csi` skip it (`tabix -l` and both `q…`/`Q…` range
  queries work on a regenerated file) and an old reader ignores it.
- Coarse rows drop the `de:f:` divergence tag, which beta.1 computed over the
  merged block.

Fine rows are byte-identical between the two betas, so the header and the coarse
tier account for the whole difference.

A whole-genome view reads the coarse tier, which is where it saves bytes. On
hg38→mm39 a whole-`chr1` query reads 12.8 MB at the fine tier against 574 KB at
the coarse one (22×); genome-wide the tiers are 348 MB against 18.7 MB (18.6×).
Across all 57 regenerated dm6 liftOver PIFs the ratio is 13.7×. The file is ~7 %
larger (141.7 MB against the 132.2 MB of the pre-tier 4.2.1 build). `make-pif`
also ran 2.5× faster on the same input: 11.0 s against beta.1's 27.7 s.

A coarse row saves only the bytes its CIGAR occupied, so an assembly with short
chains saves nothing measurable: regenerating **ce11** gave a 1.00 fine:coarse
byte ratio on all six of its PIFs, and the files came back the same size to
within a percent. The 18× ratio comes from the mammalian and cross-phylum
chains.

`lib/chainpif.sh` keeps the corpus current in two ways:

- **The CLI is the repo's pinned `node_modules/.bin/jbrowse`**, not the
  `jbrowse` on PATH (a global 4.2.1 built every PIF that existed before the
  pin). `JBROWSE_CLI` in `lib/common.sh` is the one definition, and every
  invocation in both pipelines reads it (next section).
- **Every PIF has a `.cli` stamp** in the cache dir, and every liftOver dir's
  `.checked` holds the same line (`jbrowse_cli_version`). `pif_current` and
  `pif_stamp_current` treat a missing, empty (the old `touch` format) or
  different stamp as stale, so a CLI bump rebuilds the corpus on the next run.
  The stamp records `jbrowse --version` verbatim, so it works across formats:
  beta.1 → beta.2 needed no code change here. The stamp is stored only in
  `/mnt/sdb/cdiesh/pifs`, never beside the uploaded copy, so nothing new reaches
  the bucket.

The stamp comparison is also the genark liftOver gate, which runs once per hub
over all 52,722 hubs, so a `$(…)` in it is expensive. `jbrowse_cli_version`
memoized into a global and was called as `$(jbrowse_cli_version)` inside a
`[ ]`. A command substitution runs in a subshell, so the shell discarded the
assignment every time and the gate forked a `node jbrowse --version` per hub. On
2026-09-07 that cost 24 ms a hub: make.sh took 21 minutes to print
`Processing liftOver chain files and creating PIFs...` and then find all 52,722
stamps current with nothing to do. `load_jbrowse_cli_version` now assigns
instead of echoing (and exports, so a `parallel` child inherits the value
instead of asking again), and the gate reads the stamp with `read` instead of
`$(cat)`: 1.0 s for the same corpus. `chainpif.test.sh` pins the count with a
counting CLI stub and primes the memo by hand, because calling `write_pif_stamp`
first would prime it for real and the test would pass against either version.

## Every `jbrowse` invocation uses the pinned CLI

`JBROWSE_CLI` was defined in `lib/chainpif.sh`, which only the PIF path sources.
The other six invocations called a bare `jbrowse`, which resolved to whatever a
global install happened to be: `sort-gff` in `createGeneTracksForGoldenPath.sh`
(×2), `downloadGencode.sh`, `downloadNcbiGff.sh` and `processGffFiles.sh`, and
`text-index` in both `textIndex.sh`. The global was 4.2.1 while `package.json`
named 5.0.0-beta.2, so a version no file in this repo pins wrote every GFF in
both corpora and every trix index, and a `pnpm install` changed none of it. The
definition is now in `lib/common.sh`, which all of them source, and
`chainpif.sh` reads it from there instead of keeping a second copy of the path.

A version change to either tool rewrites a corpus that nothing else would
regenerate, as the bgzip swap did, so both were measured on 2026-09-07 before
switching:

- **`sort-gff` is byte-identical** between 4.2.1 and beta.2 on all five inputs
  tried (dm6 ncbiRefSeq/xenoRefGene, hg38 ncbiRefSeqCurated, the dm and human
  NCBI GFFs, 0.4M to 4.9M lines), so the GFF corpus is unaffected and no
  re-derivation is owed.
- **`text-index` differs only by dropping duplicate postings.** 4.2.1 emitted a
  record once per occurrence of the term in it, so gene `dyw`, whose alias list
  reads `0.9 0.9 gene 0.9kb …`, appeared three times under `0.9`. Both versions
  index the same terms (180,630 on the dm hub, 244,648 on dm6) with the same
  record set for each, and removing repeats makes the two files identical. The
  beta.2 files are 11-12% smaller (35.4→31.6 MB and 100.8→88.5 MB), and the run
  is ~35% faster. A duplicate posting never produced a second search result, so
  search results do not change.

The trix corpus stays mixed on purpose: the gate is mtime (an index older than
its GFF), a 4.2.1 index and a beta.2 index return the same results, and
re-indexing 50,000 hubs to save 11% of disk would re-upload every one of them.
New and regenerated indexes come from the pinned CLI, and the rest turn over
when their GFF does. The PIF `.cli` stamps differ, because the coarse tier made
old PIFs draw worse, not only take more space.

The chain cache is never re-fetched, and one chain had been truncated since
2025-06-14: 66,891,932 bytes of hg38ToFukDam1's 90,055,223, from an aborted
download before `download_file` wrote to a tmp file and moved it. The cache
checks only that a chain exists, so `pigz: corrupted -- incomplete deflate data`
failed the same job on every run for a year with no way to repair it.
`chain_to_paf` now separates a chain that will not decompress (exit 2) from one
`chain2paf` rejected (exit 1), and `create_pif` re-downloads only on the first,
so bad chain content still fails the job instead of looping on a fetch. The
check uses the decompression the conversion already does; a `pigz -t` sweep
would decode all 585 GB a second time. Only hg38ToFukDam1 has failed so far, the
rest of the cache is unaudited, and a corrupt chain now repairs itself the first
time it is read.

The first run after a CLI bump therefore regenerates the corpus: 4,068 UCSC PIFs
(928 GB, chains cached in `/mnt/sdb/cdiesh/chains`) plus 750 GenArk, and
`rclone -c` re-sends all of it. A format change can reach the files only this
way, so no gate should block it, but start that run on purpose. The pin has
moved three times, to beta.1 (47e8273, 2026-09-01), beta.2 (08bbe01, 2026-09-02)
beta.7 (54d5899, 2026-09-10, in a commit titled only "Updates") and beta.15
(fb7b28f, 2026-10-19), and each move marked every stamp stale with no
`--reprocess` needed. This file measured the beta.1 and beta.2 formats only, and
nothing here records what beta.7 changed in a PIF. beta.7 → beta.15 changed only
the `#pif` header's `writer:Z:` value: an 86 MB hs1 chain gave 399,813 identical
records and a PIF of the same size, so the rebuild that bump started rewrote the
corpus for one header line.
