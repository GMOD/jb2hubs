---
name: derived-file-integrity
description:
  'What keeps a derived .gz, its index, a PIF and a trix index trustworthy: the
  tabix and empty-file checks, the mitoCodes cache, the bgzip toolchain
  signature and the CLI version stamps.'
---

# Derived file integrity

Moved out of the root `CLAUDE.md` on 2026-10-08, which keeps the rules. Dated
measurements and incidents read as written at the time.

### Whether the file is complete is a different question from whether it exists

`pnpm check-tabix-indexes` (`scripts/checkTabixIndexes.mjs`, in `gate_configs`)
requires a `.csi` or `.tbi` beside every derived `.bed.gz`/`.gff.gz`. Local
walk, no network, so **GenArk is in scope here** unlike the two url checks —
both trees, 50,476 files, 0.6s, all clean as of 2026-08-28.

This is the one place make's model is genuinely better than a shell pipeline's,
and it is worth stating plainly: make's unit of work is the target file, so "the
recipe ran" and "the thing it was supposed to produce exists" are the same
question. Here they are two, and nothing asked the second one. criGriChoV1 is
the shape — `tabix -C` refused an 80MB gff.gz, `run_for_assemblies_lenient`
warned and moved on, and the config shipped naming an index that was never
written. `checkTrackUrls.mjs` eventually caught it by probing urls; this catches
it on disk, before the upload.

`save_rebuild_stamp` (`lib/derive.sh`) closes the other half at the point of
derivation: it now takes the **output** as well — argument order matching
`needs_rebuild`, since the two are always a pair — and refuses to stamp when
that output is missing or empty. A recipe that exits 0 having written nothing
would otherwise be recorded as done and skipped by every later run, which is the
durable half of the failure.

Presence only, deliberately. A fresh `.gz` against an _older_ index is the other
shape worth fearing (it is what the bucket held during the bgzip backend swap,
and reads as `invalid bgzf header` rather than as a missing file), but mtime
cannot detect it: 72 of the 5,856 UCSC files have an index whose mtime precedes
the data by up to **0.05 seconds**, which is bgzip and tabix finishing inside
one filesystem timestamp. A tolerance big enough to absorb that would absorb a
real stale index too. What defends that shape is `assert_bgzip_toolchain` (the
cause) and `rclone_sync_with_indexes`' ordering (the exposure).

### The other half again: a `.gz` with an index and no records

`save_rebuild_stamp` refuses an output that is missing or empty, and
`check-tabix-indexes` requires an index beside it. A **28-byte** `.gff.gz` — the
BGZF end-of-file block and nothing else — satisfies both, and four of them had
been shipping since 2026-06-03, each with a `.hash` recording it as built and a
source table full of rows: `galGal2` xenoRefGene (438,401 of them), `hg16`
encodeEgaspFullGenemark, `hg16` pseudoYale, `tetNig1` hoxGenes.

What broke them is UCSC's own data, in two shapes, both of which stop `bed2gff`
dead — and a failing derivation costs not just its own track but every gene
track after it in that assembly, since `process_assembly` in
`createGeneTracksForGoldenPath.sh` runs under `set -e`:

- **Exons that run backwards.** 9 of galGal2's xenoRefGene rows have an
  `exonEnds` entry behind its `exonStarts` partner (`NM_017037`'s seventh exon
  is 2176615..2176258), which becomes a negative BED block size that
  `BedRecord::parse` refuses — `Cannot parse field`, and the message named
  neither the row nor the file. `geneLike.ts` drops such rows now and reports
  how many; the parse error carries the offending line.
- **Names with spaces in them.** hg16's `encodeEgasp*` tables put the GTF
  attribute verbatim in the `name` column — every transcript is
  `transcript_id "ENr231_1";` — and tetNig1's hoxGenes has a `CDS EVX-HOXA`. Two
  things split those on whitespace: `hck`, whose `--delimiter` defaults to
  `\s+`, so the isoforms file was built out of the wrong columns entirely, and
  bed2gff's `parallel_hash_rev`. The transcript then matches nothing in the
  isoforms map and `resolve_genes` exits 1. Both split on tab now. That name
  also lands in GFF3 column 9, where its `;` would end the attribute, so
  `writer.rs` percent-encodes the reserved set — a value without one is written
  through untouched, which is every ordinary gene in the corpus.

The gap that let this last three months is the section above, one step further
in: nothing asks whether a derived file holds any **records**. `find` over the
built tree for `-size -100c` is the cheap version of that question, and it is
how these four were found.

All three fixed files are in `DERIVATION_SOURCES`, so the next run re-derives
every gene track on all 238 assemblies. Only the handful of files described here
can come out different — but "byte-identical everywhere else" is an argument
about names and coordinates across the whole corpus, and nobody has run that
scan, so take the re-derivation rather than advancing `.derivation_hash` by
hand.

### A post-processing step with no gate is where over-invalidation gets expensive

`PIPELINE_SOURCES` being broad is the right trade _because_ a reprocess is cheap
on a warm tree — every per-file derivation is `needs_rebuild`-gated.
`addGeneticCodes.ts` was the exception, with no gate at all, and now runs for
every assembly on every config build, so without a cache each run would cost a
full round of NCBI eutils queries **plus one `chrom.sizes` fetch per assembly
from hgdownload** — unbudgeted, against the same host `check-track-urls` is held
to 300 requests a day against.

`src/mitoCodes.ts` restores the invariant, and the second half is the
non-obvious one:

- **The taxId → mito code answers are cached** (`ucsc2jbrowse/.mitoCodes.json`,
  gitignored, 180-day TTL). Negatives are cached too: `null` means "NCBI
  answered and this taxon has no MGCId", and without it every such taxon is
  re-queried forever. Only taxa in a chunk NCBI actually **served** may be
  cached as negative — caching a failed request as an answer would suppress the
  genetic code until the TTL expired.
- **`chrom.sizes` is read from the mirrored sidecar already on disk.** This step
  runs before `mirrorAssemblySidecars` in `buildConfigs.ts`, and the config is
  rebuilt from scratch on every run — so at that point it names the upstream url
  again _even though the previous run's mirrored file is sitting right next to
  it_. Only `config.json` is rebuilt; the sidecars are not.
  `localChromSizesPath` asks `mirrorSidecars` for the naming rule rather than
  keeping a second copy of it.

Measured 2026-08-28 on hg38 and dm6, configs restored to their pre-finalize
shape: cold cache 2 NCBI queries and **0** hgdownload fetches; warm cache 0 and
0, with both configs reported already current. The run summary prints those
counts, because a silent regression to fetching would otherwise look identical.

Two scope decisions to leave alone. **Track prose is out of scope**: the configs
carry UCSC's trackDb html, which links ncbi, ebi, ensembl and a long tail of lab
pages — ~700 urls that are documentation, and a rotted citation is not a broken
track. **GenArk is out of scope**, for the reason the sidecar check is: 50,703
configs naming ~150k upstream files, and probing them in bulk is the road back
to the reverted mirroring sweep.

### And one level down again: the compressor is not in any hash

`source_tree_hash` covers the repo's code. It does not cover the **toolchain**,
and the bytes a derived `.gz` holds are a function of the bgzip build as much as
of the converter. htslib 1.23.1 linked against libz emits ~6% larger output than
the same version linked against libdeflate, and the _decompressed_ content is
byte-identical — so every check here passes either way.

On 2026-08-27 a `~/.local` htslib upgrade (installed Aug 2, linking libz where
`/usr/bin`'s htslib 1.13 links `libdeflate.so.0`) swapped the backend silently.
The next `REDERIVE` rewrote **5,757 files / 76.7 GB** with no content change,
`rclone -c` correctly saw different bytes and re-sent all of them, and because
`rclone_sync_with_indexes` is two passes the run left fresh `.gz` against stale
`.csi` in the bucket for every assembly it reached — `invalid bgzf header` on
hg19 and hg38 in production, traced to nothing anyone had pushed.

`assert_bgzip_toolchain` (`lib/derive.sh`, called from both `make.sh` before any
derivation) pins the property that matters: **the bytes bgzip emits**, compared
against `BGZIP_TOOLCHAIN_SIGNATURE`. Three things about it are load-bearing:

- **Not a version string.** `bgzip --version` read `1.23.1` before and after the
  swap. A version check would have caught nothing.
- **The canary input is 2.4 MB of varied bed-like data, deliberately.** A short
  input hashes _identically_ under htslib 1.13 and 1.23.1 — both libdeflate,
  both disagreeing on real files (243,569 vs 242,051 bytes on the same bed) — so
  a trivial canary waves through exactly the drift this exists to catch. Cost is
  0.09s per run.
- **Fatal, not a warning.** The failure is invisible in the output and surfaces
  only as an unexplained multi-GB re-upload plus desynchronized indexes, which
  is precisely the shape a warning gets scrolled past. `ALLOW_BGZIP_DRIFT=1`
  accepts a deliberate change, which means committing the new signature and
  accepting that every derived `.gz` and `.csi` gets rewritten and re-sent.

The **guard** asserts the host; the **test** asserts the mechanism, and mixing
those up cost three test suites. `lib/common.test.sh` used to fail unless the
machine running it matched the pin — which no CI runner can, having no bgzip at
all — and because the workflow step was a plain list under `bash -e`, that took
`lib/chainpif.test.sh` and `genark2jbrowse/deriveGeneticCodes.test.sh` (then
named `addNcbiGffAndTextIndex.test.sh`) down with it, so neither had ever run in
CI. The suite now checks determinism, canary size, rejection of a different
build and the override, and _reports_ the host's own match unless
`BGZIP_STRICT=1` (worth setting on the build box). Nothing is lost: the
protection was never the test, it is `assert_bgzip_toolchain` being fatal in
both `make.sh` files before any derivation. The step also runs every suite and
fails afterwards, because one red suite must not hide the others.

Worth knowing if it ever fires: libdeflate levels are **not** comparable across
htslib versions, so no `-l` makes 1.23.1 reproduce 1.13 (l5→243,497, l6→242,051,
l7→239,062). Matching an existing corpus means matching the build, not tuning
the level. The corpus today is htslib 1.23.1 + libz, chosen for stability over
the 6% — file size was explicitly not the priority.

### The PIF corpus is keyed on the CLI that wrote it

Same shape one tool over: a PIF's bytes are a function of `jbrowse make-pif`'s
version as much as of the chain, and the format has now moved twice inside the
5.0 betas.

`5.0.0-beta.1` (2026-08-31) added a **coarse level-of-detail tier** beside the
per-row CIGAR tier — the same alignments under uppercase `T<chr>`/`Q<chr>`
refnames, split at indels ≥ 10 kb, which the v5 adapter probes for and switches
to at `coarseBpPerPxThreshold` (10,000 bp/px). A v4 adapter queries `t<chr>` and
never sees the uppercase rows, so a regenerated PIF ships to production without
a staging sibling. Measured on hg38→mm39: 33 s, 141.5 MB against 132.2 MB (+7
%), 80,845 fine and 121,175 coarse row pairs.

`5.0.0-beta.2` (bumped here 2026-09-02) changes the coarse tier from a
**re-segmentation** of the alignments into a **projection** of them, and makes
the file say so. Measured on hg38→mm39 (80,845 PAF records, the same `.paf` fed
to both):

- **A coarse row is now exactly its fine row without the CIGAR.** 80,845 coarse
  against 80,845 fine, and comparing (refname, start, end, strand, target start,
  target end) across the two tiers gives **zero** differing rows. beta.1 emitted
  121,175 coarse rows against the same 80,845 fine ones, of which 43,902 had no
  fine counterpart at those coordinates — so crossing `coarseBpPerPxThreshold`
  used to redraw the view as a differently-segmented picture. It no longer does;
  the two tiers now differ only in what they cost to read.
- A leading `#pif` header line, in PAF tag syntax:
  `#pif  version:i:1  tiers:Z:fine,coarse  coarse:i:10000  cigars:Z:all`, so the
  layout is declared rather than probed for. It is a `#` comment, so tabix and
  `--csi` skip it (verified: `tabix -l` and both `q…`/`Q…` range queries work on
  a regenerated file) and an old reader ignores it.
- Coarse rows lose the `de:f:` divergence tag, which beta.1 computed over the
  merged block.

Fine rows are byte-identical between the two betas, so the entire delta is the
header plus the coarse tier.

**The coarse tier is what a whole-genome view reads, and that is where the win
is.** On hg38→mm39, a whole-`chr1` query costs 12.8 MB at the fine tier against
**574 KB** at the coarse one — 22×; genome-wide the two tiers are 348 MB against
18.7 MB, 18.6×. Across all 57 regenerated dm6 liftOver PIFs the ratio is 13.7×.
The file is ~7 % larger for it (141.7 MB against the 132.2 MB of the pre-tier
4.2.1 build), which is the trade.

`make-pif` also got **2.5× faster** on the same input: 11.0 s against beta.1's
27.7 s.

The payoff is not uniform, and it is worth knowing which corpus you are looking
at. A coarse row saves only the bytes its CIGAR occupied, so an assembly whose
chains are short saves nothing measurable — regenerating **ce11** gave a 1.00
fine:coarse byte ratio on all six of its PIFs, and the files came back the same
size to within a percent. The mammalian and cross-phylum chains are where the
18× lives.

Two things hold the corpus current, both in `lib/chainpif.sh`:

- **The CLI is the repo's pinned `node_modules/.bin/jbrowse`**, not whatever
  `jbrowse` is on PATH (a global 4.2.1 was what built every existing PIF).
  `JBROWSE_CLI` in `lib/common.sh` is the one definition, and as of 2026-09-07
  **every** invocation in both pipelines reads it — see below.
- **Every PIF carries a `.cli` stamp** in the cache dir and every liftOver dir's
  `.checked` holds the same line (`jbrowse_cli_version`). `pif_current` and
  `pif_stamp_current` treat a missing, empty (the old `touch` format) or
  different stamp as stale, so a CLI bump rebuilds the corpus on the next run.
  The stamp records `jbrowse --version` verbatim, which is what makes it
  format-agnostic — beta.1 → beta.2 needed no code change here at all. The stamp
  lives only in `/mnt/sdb/cdiesh/pifs`, never beside the uploaded copy, so
  nothing new reaches the bucket.

The stamp comparison is also the genark liftOver **gate**, run once per hub over
all 52,722 of them, and that is what makes a `$(…)` in it expensive.
`jbrowse_cli_version` memoized into a global and was called as
`$(jbrowse_cli_version)` inside a `[ ]` — a command substitution is a subshell,
so the assignment was discarded every time and the gate forked a
`node jbrowse --version` **per hub**. Measured 2026-09-07: 24 ms a hub, **21
minutes** for make.sh to print
`Processing liftOver chain files and creating PIFs...` and then decide that all
52,722 stamps were already current and there was nothing to do.
`load_jbrowse_cli_version` assigns instead of echoing (and exports, so a
`parallel` child inherits rather than re-asks) and the stamp is read with `read`
rather than `$(cat)`: **1.0 s** for the same corpus. `chainpif.test.sh` pins the
count with a counting CLI stub, priming the memo by hand — calling
`write_pif_stamp` first would prime it for real and the test would pass against
either version.

### Only `make-pif` was on the pinned CLI; `sort-gff` and `text-index` were not

`JBROWSE_CLI` was defined in `lib/chainpif.sh`, which only the PIF path sources.
The other six invocations — `sort-gff` in `createGeneTracksForGoldenPath.sh`
(×2), `downloadGencode.sh`, `downloadNcbiGff.sh` and `processGffFiles.sh`, and
`text-index` in both `textIndex.sh` — called a bare `jbrowse`, which resolved to
whatever a global install happened to be. That was **4.2.1** while
`package.json` named **5.0.0-beta.2**, so every GFF in both corpora and every
trix index was written by a version no file in this repo pins, and a
`pnpm install` moved none of it. The definition now lives in `lib/common.sh`
(sourced by all of them) and `chainpif.sh` picks it up from there rather than
keeping a second copy of the path.

Measured 2026-09-07 before switching, because a version change to either tool
rewrites a corpus that nothing would otherwise regenerate — the bgzip lesson one
tool over:

- **`sort-gff` is byte-identical** between 4.2.1 and beta.2 on all five inputs
  tried (dm6 ncbiRefSeq/xenoRefGene, hg38 ncbiRefSeqCurated, the dm and human
  NCBI GFFs — 0.4M to 4.9M lines). So the GFF corpus is unaffected and no
  re-derivation is owed.
- **`text-index` differs, and only by dropping duplicate postings.** 4.2.1
  emitted a record once per occurrence of the term in it, so gene `dyw`, whose
  alias list reads `0.9 0.9 gene 0.9kb …`, appeared three times under `0.9`.
  Same terms (180,630 on the dm hub, 244,648 on dm6), same record set for every
  one of them — collapsing repeats makes the two files identical — and 11-12%
  smaller: 35.4→31.6 MB and 100.8→88.5 MB. It is also ~35% faster. A duplicate
  posting was never a second search result, so nothing about search changes.

The trix corpus is therefore left **mixed** on purpose: the gate is mtime (index
older than its GFF), a 4.2.1 index and a beta.2 index answer identically, and
re-indexing 50,000 hubs to save 11% of disk would re-upload every one of them.
New and regenerated indexes are beta.2's; the rest turn over when their GFF
does. That is a different call from the PIF `.cli` stamps, where the coarse tier
made old files functionally worse, not just larger.

A cached chain, by contrast, is never re-fetched — and one of them had been
truncated since 2025-06-14, 66,891,932 bytes of hg38ToFukDam1's 90,055,223, an
aborted download from before `download_file` grew its tmp+mv. Existence is all
the cache asks, so `pigz: corrupted -- incomplete deflate data` failed the same
job on every run for a year with no way to repair it. `chain_to_paf` now
separates a chain that will not **decompress** (exit 2) from one `chain2paf`
**refused** (exit 1) and `create_pif` re-downloads on the first only, so bad
chain content still fails loudly instead of looping on a fetch. Detection rides
the decompress the conversion already does: a `pigz -t` sweep would cost a
second full decode of all 585 GB to find whichever ones are wrong (only
hg38ToFukDam1 has failed so far, and the rest of the cache is unaudited — a
corrupt one now repairs itself the first time it is read).

The first run after a bump is therefore the regeneration: 4,068 UCSC PIFs (928
GB, chains cached in `/mnt/sdb/cdiesh/chains`) plus 750 GenArk, and `rclone -c`
re-sends all of it. Nothing about that is a mistake to be gated away — it is the
only way a format change reaches the files — but it is a run to start on
purpose. As of the beta.2 bump every stamp on disk reads beta.1 (and 1,913 of
the UCSC PIFs predate stamping entirely), so the whole corpus is already marked
stale and no `--reprocess` is needed to force it.
