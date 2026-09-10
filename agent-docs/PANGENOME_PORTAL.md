# Three pangenomes, one approach: human, mouse, bovine

Written 2026-09-09. The goal is stated: **consistent approaches across human,
mouse and bovine**, at maximum alignment, reconsidered only where a technical
barrier makes it impossible. This records where the three actually stand, which
divergences are conventional and which are structural, and the one place the
graph itself refuses.

Everything below was probed rather than recalled; each claim says how.

## The stack all three sit in

A pangenome reaches a reader through three routes off one graph. They are not
alternatives of equal power.

| route                   | artifact                                          | what it can say                                           |
| ----------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| BED projections         | `segs`+`links`, `bubbles`, `alleles`, `tier10000` | browse by locus, hover sync, whole-chromosome coarse tier |
| reference-projected VCF | `vg deconstruct` / vcfwave / `mgutils merge`      | multi-sample matrix, and the explorer's summary charts    |
| query-time GBZ          | `.gbz.db` + haplotype index, via `@gmod/gbz-base` | the above **plus carriage and per-haplotype alignment**   |

rGFA and a P/W-line GFA differ only in how they encode coordinates — rGFA states
`SN`/`SO`/`SR` per segment, a path GFA states the same thing in path order. That
is why one normalized BED pair serves both and `RgfaTabixAdapter` reconstructs a
synthetic rGFA from it. See `agent-docs/reference/PANGENOME_GRAPHS.md` in
jbrowse-components, which is the authority for the graph half.

**Every adapter in this stack lives in the third-party graphgenomeviewer plugin,
not core** — `RgfaTabixAdapter`, `MinigraphBubbleAdapter` and
`GbzBaseSyntenyAdapter` are all absent from a grep of jbrowse-components'
`plugins/` and `packages/`. So the linear tracks are as plugin-gated as the
graph view, and none of this reaches production before core v5 regardless of how
it is wired. That is the reason to spend the interim on normalization rather
than on racing datasets out.

## What is already consistent

All three publish the identical five-file set under the same suffixes, all live
and range-served (probed 2026-09-09, every one 200):

```
<prefix>.segs.bed.gz          <prefix>.bubbles.bed.gz
<prefix>.links.bed.gz         <prefix>.alleles.bed.gz
<prefix>.tier10000.segs.bed.gz
```

| dataset | prefix                                             |
| ------- | -------------------------------------------------- |
| human   | `demos/hprc/hprc-v2.1-mc-grch38`                   |
| mouse   | `demos/mouse_pangenome/mouse-mm39-minigraph`       |
| bovine  | `demos/bovine_pangenome/bovine-arsucd12-minigraph` |

Built by the same three scripts in all three cases — `build_rgfa_tabix.sh`,
`build_rgfa_alleles.sh`, `build_bubble_tier.sh` from jbrowse-components. The
mouse `buildJbrowse.sh` calls copies of them; the bovine README cites them by
path. Layer one of the stack needs no work.

## What diverges conventionally, and the target

None of these is hard. They are listed because each is a place a later reader
would otherwise have to rediscover which of three shapes is the intended one.
Most have since converged on the target, and the rows say so rather than being
deleted — what the divergence WAS is the reason the target is what it is.

| dimension                | human                                                                                                      | mouse                                                      | bovine                                          | target                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| bucket prefix            | `demos/hprc/`                                                                                              | `demos/mouse_pangenome/`                                   | `demos/bovine_pangenome/`                       | one scheme; `demos/<species>_pangenome/`              |
| basename                 | `hprc-v2.1-mc-grch38`                                                                                      | `mouse-mm39-minigraph`                                     | `bovine-arsucd12-minigraph`                     | `<dataset>-<ref>-<method>`, versioned iff upstream is |
| rGFA published beside    | no                                                                                                         | yes, 911 MB                                                | yes, 760 MB                                     | always (it is what makes the BEDs reproducible)       |
| assembly block in config | TwoBit + `jbrowse.org/ucsc/hg38/` sidecars _(was a bgzip FASTA with **bare-numeric refnames**; see below)_ | TwoBit + `jbrowse.org/ucsc/mm39/` sidecars, `chr` refnames | TwoBit + `jbrowse.org/ucsc/bosTau9/` sidecars   | **the mouse shape** — converged                       |
| tier trackId             | `hprc_minigraph_tier` _(the bucket still serves `hprc_tier`; see the ordering hazard below)_               | `mouse_minigraph_tier`                                     | `bovine_minigraph_tier`                         | `<p>_minigraph_tier` — converged in the tree          |
| config source of truth   | `website/pangenome-config/hprc-grch38.json`                                                                | `website/pangenome-config/mouse-mm39.json`                 | `website/pangenome-config/bovine-arsucd12.json` | all three in `website/pangenome-config/` — converged  |
| build script             | committed in jbrowse-components `scripts/`                                                                 | `scripts/build_mouse_pangenome.sh`                         | `scripts/build_bovine_pangenome.sh`             | committed in `scripts/` — converged                   |

The assembly-block difference is the one worth reading twice, because both
shapes work and they are not the same refname space. The human config's sequence
is `hg38.prefix.fa.gz`, whose refnames are **bare numeric** despite the name
(HOSTING.md records this), reconciled by a bespoke `hg38_aliases.txt` whose
first column is `1`. The mouse config's sequence is the hgdownload 2bit with
UCSC `chr` refnames and `jbrowse.org/ucsc/mm39/mm39.chromAlias.txt`, first
column `chr1`. The mouse shape is the one consistent with this repo's own
sidecar doctrine (CLAUDE.md's `MUST_BE_LOCAL` names hg38 and mm39), and all
three references have their sidecars mirrored — `chromAlias.txt`, `chrom.sizes`
and `ncbiRefSeq.gff.gz` probed 200 for hg38, mm39 and bosTau9.

### The version drift, which is a symptom rather than an accident

The tutorials moved to HPRC **v2.1**. This repo is entirely on **v2.0** — 13
pins across three files (recounted 2026-09-10, after the fourth file's download
table was deleted):

- `website/pangenome-config/hprc-grch38.json` — all six track URIs
- `website/src/components/pangenomeDataset.ts` — `graphVcf.url`, its trackId and
  `HPRC_PORTAL.filePrefix`
- `ucsc2jbrowse/ucscExtensions/hg38.json` — the served VCF and the allele
  inventory

Both versions are live in `demos/hprc/` (v2.0 `segs.bed.gz` 6,693,943 bytes,
v2.1 6,686,172), so nothing errors — we are just quietly serving the older
graph, and the 8.4 MB of committed explorer summaries under
`website/public/pangenome/` are v2.0-derived. **No gate would ever notice.**
This is the same class as CLAUDE.md's "the plugin bundles are published from
another repo": a config here goes stale from a push there, and push-triggered CI
structurally cannot see it.

## The structural divergence: carriage

**Carriage** is the per-node sample set: given a node in the graph, which
haplotypes' paths actually walk through it. It is the difference between "this
allele exists somewhere in the panel" and "these 7 of 19 strains have it and the
other 12 do not". The plugin renders it as `carriedBy`; `pggb_gfa_to_bed.py`
writes it into the BED as the `SM:Z:` tag, and the GFA parser reads it back into
`GraphNode.samples`.

It is not the same thing as rank. rGFA's `SR` records the construction
generation at which minigraph first added a segment, so it can say
"non-reference" and "first seen in the Nth assembly processed" — but a segment
first seen in one assembly may be carried by any number of others, and the tag
says nothing about them. Reporting rank as carriage is simply wrong, which is
why the bovine README writes "never carriage" about its own `firstSeenIn`
column.

Two things in the explorer are arithmetic over carriage and cannot be computed
without it: **allele frequency** (carriers ÷ haplotypes) and **per-sample
burden** (sites where a given sample differs from the reference). So does the
lane-selection question that turns an eight-haplotype demo into a 464-haplotype
one — "which haplotypes differ here".

Whether a dataset can recover carriage depends on one thing: whether its graph
records haplotype paths.

- **human — yes.** The minigraph-cactus graph carries 464 haplotype walks, and
  HPRC now publishes `.gbz.db` itself:
  `…/release2/minigraph-cactus/v2.1/hprc-v2.1-mc-grch38/hprc-v2.1-mc-grch38.gbz.db`,
  10,050,412,544 bytes, probed 200. Our companion anchored haplotype index is
  live at `demos/hprc/hprc-v2.1-mc-grch38.haplotype-index.anchored.db`,
  7,873,716,224 bytes.
- **bovine — yes, and it was thrown away.** The Zenodo source GFA carries **12 P
  lines per chromosome** (`P HER 1+,2+,3+,…`; census of
  `Zenodo/minigraph/10.gfa`: 1 H, 15,349 S, 21,854 L, **12 P**), still on disk
  in `/mnt/sdb/cdiesh/bovinePangenome/Zenodo/minigraph/`. Real carriage is right
  there. The build discarded it by routing through the reconstructed rGFA and
  `gfatools gfa2bed` instead of `pggb_gfa_to_bed.py`, which is the script that
  emits the `SM:Z:` carriage tag. Its `firstSeenIn`/`discoveryRank` is therefore
  P-line order, and its own README says so: "never carriage".
- **mouse — no, structurally.** A line-type census of the whole 3.3 GB
  `mouse-mm39-minigraph.rgfa` finds `H`, `S` and `L` only: **zero P or W
  lines.** `minigraph -cxggs` emits no haplotype paths, so the graph physically
  cannot say which strain carries which allele, and `firstSeenIn` there is
  construction order.

**The March attempt was the right design.**
`~/mousePangenome/createMousePangenome.sh` builds the same 19-assembly panel
with `cactus-pangenome … --gfa clip filter --vcf --hal`, which emits haplotype
paths natively. It never ran — `/mnt/sdb/cdiesh/mousePangenome/out/cactus.log`
is 148 bytes from 2026-03-21 and there is no HAL and no VCF — and
`genark2jbrowse/src/createEnsemblMouseChainTracks.ts:13` still names the VCF
that build would have produced
(`genomes.jbrowse.org/hubs/genark/mouseEnsemblPangenome/mousePangenome.vcf.gz`,
probed **404**). Substituting plain minigraph in September is precisely what
left mouse unable to match the other two.

## Base level is not the target, and thinking it was cost a planning round

The first version of this file had bovine going base-level, on the reasoning
that human's minigraph-cactus graph is base-level and bovine's minigraph one is
not. **That is wrong about human.** Corrected 2026-09-09 by reading the HPRC
tutorial rather than inferring from the pipeline's name:

> the SV-resolution graph (`sv.gfa`), the minigraph backbone our rGFA tabix
> [tracks read] … `build_rgfa_tabix.sh` is what we ran on HPRC's `sv.gfa.gz` …
> the reason this page reads `sv.gfa` rather than the base-level `gfa.gz` beside
> it

Its own file table makes the sizes explicit — `*.sv.gfa.gz` 842 MB is the
SV-resolution rGFA, `*.gfa.gz` 63 GB is base-level and is **deliberately not
used** — and it states the split in one line: "the `sv.gfa` is the graph route;
the VCF is the variant route."

The arithmetic agrees. These BED projections run about 9.6 bytes per segment
(bovine 425,796 segments → 4.07 MB; mouse 1,321,274 → 12.3 MB), and human's
`segs.bed.gz` is 6.69 MB, so its graph holds on the order of 700,000 segments. A
base-level 464-haplotype human graph has that many nodes several hundred times
over.

So **all three graph routes are already at parity**, at SV resolution, from a
minigraph rGFA. Taking bovine base-level would make it the odd one out — more
detailed than the reference implementation, on a route that implementation
examined and declined. The site's own headline filter says the same thing from
the other end: `SV_FILTER` in `pangenomeLinks.ts` is
`INFO.LV[0]==0 && alleleLength(feature)>=50`, so every human graph launch is
already showing only the structural tier.

Extracting `Zenodo/cactus` or `Zenodo/pggb` is therefore **not** on the plan.
The 12 GB tarball does hold them (29 files each, 26.1 GB and 23.7 GB, never
extracted), and they remain the route to a base-level bovine graph if one is
ever wanted for its own sake. Nothing here wants one.

## What is actually missing, per route

Three routes, and the gap is only ever in the second and third.

- **Graph route (SV-resolution BEDs).** All three, at parity, today. Nothing
  owed.
- **Variant route (a reference-projected VCF).** Human has HPRC's published
  `wave` VCF. Bovine and mouse have none, and this is the gap that matters: it
  is what the explorer's type, size, allele-frequency and per-sample panels are
  computed from.
- **GBZ route (query-time carriage and per-haplotype alignment).** Human only —
  and worth being precise about why, because it is not a design decision here:
  **HPRC publishes the `.gbz.db` itself** (10,050,412,544 bytes, probed live),
  and all we build is the companion haplotype index that upstream's database
  lacks. Nobody publishes a GBZ for cattle or mouse, so this route was never
  symmetric work.

### The GBZ route, measured rather than assumed

`@gmod/gbz-base` ([GMOD/gbz-base-js](https://github.com/GMOD/gbz-base-js), 2.6.2
on npm, one dependency — `generic-filehandle2`) is a pure TypeScript reader with
no server side: it pulls SQLite pages out of the `.gbz.db` by HTTP range
request. Run from node on 2026-09-10 against the two published files, with no
local copy of either:

| call                                           | result                    | time  |
| ---------------------------------------------- | ------------------------- | ----- |
| `GBZBase.open` (10.0 GB db + 7.9 GB index)     | —                         | 0.32s |
| `getAlignmentsForRange`, `keep` = the demo's 8 | 16 records                | 1.40s |
| `getAlignmentsForRange`, no filter             | **468 records**           | 0.34s |
| `getSubgraphForRange`                          | 7,088 nodes, 469 paths    | 0.21s |
| `toSubgraphJson`                               | —                         | 0.04s |
| `paths()`                                      | 53,150 paths, 233 samples | 1.01s |

Two things in that table are the argument. **All 464 haplotypes answer in a
third of a second** over a 105 kb window, so the lane does not have to be a
curated eight — the adapter is not the constraint. And the records carry what no
other route here can: the CFHR window returns
`HG01123#1#CM089081.1[191896727-191917111]` with CIGAR
`6605M4D3940M2D349M1D3594M84684D405M1I4226M1D1264M`. That **84,684 bp deletion
is the CFHR3–CFHR1 deletion**, read out of the graph, attributed to a named
haplotype, in that haplotype's own contig coordinates.

Two things it does not hand over for free, and both bear on wiring it up:

- **`MultiWaySyntenyDisplay` draws one lane per assembly, so each haplotype has
  to BE an assembly in the config.** `demos/hprc/config.json` declares nine
  (hg38 plus eight), each a `ChromSizesAdapter` over a one-line
  `hprc_cfhr_<hap>.chrom.sizes` naming just the contig that demo's locus sits
  on. A lane that works across a whole catalogue needs more than one line each.
- **`haplotypeLength(handle)` is the FRAGMENT length, not the contig length.**
  Paths are fragmented — `pathsForSample('HG00097')` returns 210, five of them
  on `CM094060.1` at 104 Mb / 17.8 Mb / 263 kb / 1.6 Mb / 1.5 Mb — and
  `name.fragment` is the offset into the contig. So a per-haplotype
  `chrom.sizes` is derivable from the database alone, but as
  `max(fragment + length)` per contig rather than by reading a field.

Both blockers on shipping it are the same shape as everything else here:
`GbzBaseSyntenyAdapter` lives in the graphgenomeviewer plugin, and
`MultiWaySyntenyDisplay` landed on jbrowse-components `main` on 2026-09-09 and
is **absent from v4.3.0** (`git cat-file -e` against the newest tag). So the GBZ
lane is v5-only, exactly like the graph pane it would sit beside.

### The variant route, for bovine: minutes, on data already extracted

`vg deconstruct` over the P-line minigraph GFA gives exactly the file the
explorer reads. Measured 2026-09-09 on the smallest chromosome,
`Zenodo/minigraph/25.gfa` (43.9 MB):

```
vg convert -g 25.gfa -p     1.6 s
vg deconstruct -p HER -a    0.42 s wall  ->  2,593 records
```

and the records carry the vocabulary the generator already parses, plus a GT
column per assembly:

```
AC=1,1;AF=0.0909091,0.0909091;AN=11;AT=...;NS=11;LV=0;RC=HER   FORMAT GT
ANG BIS BRA BSW GAU HIG NEL OBV PIE SIM YAK
```

`AF` and per-sample `GT` are carriage, allele frequency and per-sample burden in
one file. `LV` is present, so `SV_FILTER` applies unchanged. The whole 2.63 GB
minigraph set extrapolates to roughly two minutes of `vg` and a few MB of VCF —
small precisely because it is SV-resolution, where HPRC's base-level `wave` VCF
is 2.3 GB.

One thing to handle: `deconstruct` names CHROM after the path it was given, so
these say `HER`, not `chr25`. Rename the P line to the PanSN form before
converting (the mapping `gfa_paths_to_rgfa.py` already applies) rather than
rewriting CHROM afterwards, so one rule produces both files' names.

### The variant route, for mouse: hours, and no shortcut

No P or W lines means `vg deconstruct` has nothing to project.
`minigraph -cxasm --call -t16 graph.gfa sample-asm.fa` per assembly gives each
one's traversal of every bubble and `misc/mgutils.js merge -r0` turns the calls
into a VCF (both documented in `~/src/minigraph/README.md`). All 19 assemblies
are already downloaded, 30 GB in `/mnt/sdb/cdiesh/mousePangenome/fasta/`.

### The minigraph-cactus rebuild is optional, which is a correction

An earlier draft called it "what makes mouse a peer of demos/hprc". It is not,
now that the routes are separated properly: mouse is already a peer on the graph
route, and `--call` closes the variant route. The rebuild buys the **GBZ route
only** — and that is a route human got from upstream rather than one we built,
so parity there was never on offer. Multi-day on one box, for one route out of
three, on the one dataset where nobody upstream has done it. Worth doing if
query-time carriage for mouse is wanted for its own sake; not a prerequisite for
anything on the page.

## The target, per dataset

|        | graph route                  | variant route               | GBZ route                                 |
| ------ | ---------------------------- | --------------------------- | ----------------------------------------- |
| human  | v2.1 `sv.gfa` — **have**     | HPRC `wave` — **have**      | upstream `.gbz.db` + our index — **have** |
| bovine | Leonard minigraph — **have** | `vg deconstruct`, ~2 min    | `vg` → `gbz2db`, if wanted                |
| mouse  | built here — **have**        | `--call` + `mgutils`, hours | needs the rebuild                         |

## Decision: the configs stay in this repo

They belong in `website/pangenome-config/*.json`, all three, and **not** in
jbrowse-components' `demos/`. The reasoning, since the opposite is tempting:

- **This repo is the only consumer.** A URL census over
  `website/docs/tutorials/pangenome_hprc*.md` in jbrowse-components names
  `demos/hprc/<prefix>` (the adapter prefix) and `demos/hprc/README.txt`, and
  never `jbrowse.org/pangenome/hprc-grch38/config.json`. The tutorials build
  their sessions from the data directly. Moving the configs there would add a
  consumer-less artifact to a repo that is already carrying the whole demo
  corpus.
- **The machinery is here and is tested.** `website/pangenome-config/upload.sh`
  already loops `for f in *.json`, stamps each with `upload_if_changed`, and
  invalidates `/pangenome/*/config.json` once. Adding two files is the whole
  change.
- **Relocation was never the fix for the drift anyway.** The v2.0/v2.1 gap is
  not caused by where the file lives, it is caused by nothing checking it. This
  repo already has the idiom for that: `check-plugin-urls`,
  `check-sidecar-urls`, `check-config-compat`, `check-track-urls`. So:

  **`pnpm check-pangenome-assets`** — for every adapter URI in
  `website/pangenome-config/*.json`, assert it resolves (HEAD 200), and assert
  the version substring matches the value the file pins. A dataset moving
  upstream then fails loudly here instead of silently serving last year's graph.
  Cheap: ~20 HEAD requests against our own bucket, so it belongs in
  `gate_configs` beside the others rather than on a budget. It covers all three
  datasets by construction, which is the point of having one shape.

  It also asserts, since `b7d8cd7c290`, that **the config itself is served at
  the url the site links, byte-for-byte as committed** — which turned out to be
  the check that was actually missing. Every url INSIDE `bovine-arsucd12.json`
  resolved while the config was 404 in the bucket, because `upload.sh` beside it
  had not been run since it landed; and `hprc-grch38.json` was live and three
  hundred bytes stale at the same moment, still naming `hprc_tier`. A launch
  reads `?config=` from the reader's own browser and genomes.jbrowse.org sends
  no CORS headers, so the bucket copy is the only copy that exists as far as a
  launch is concerned — a config that is only in git is a launch that fails
  before it starts. Byte comparison rather than a HEAD, for the same reason
  `upload_if_changed` stamps a byte-exact copy; the stamps themselves were no
  help, mouse having none at all despite being live.

## Nothing reaches the bucket without a committed script and a README

This is an invariant, not a preference, and it is the one this whole
investigation was a consequence of breaking. The mouse and bovine data have been
serving since 2026-09-02 from `demos/mouse_pangenome/` and
`demos/bovine_pangenome/`, and until step 2 below the only record of how they
were made is a set of shell scripts on one build box under `/mnt/sdb`, outside
git. Reproducing either dataset today means finding that machine.

So, for any step that processes raw data:

- **The build script is committed before the data is uploaded**, in
  jbrowse-components `scripts/`, beside `build_rgfa_tabix.sh` and the rest.
  HOSTING.md's "Demo assets drift from their build scripts" section is the
  standing warning; these two are the current instance of it.
- **A `README.txt` ships beside the data in the bucket**, carrying the source
  and its checksums, what was modified and why, the tool versions, the exact
  commands, the audits that were run and their results, and the caveats a reader
  would otherwise misinterpret. The existing
  `demos/{mouse,bovine}_pangenome/README.txt` are the model — the bovine one's
  "Rank above 0 is a CONVENTION, not a measurement" paragraph is precisely the
  kind of thing that is invisible from the data and wrong to omit.
- **The run is logged and the log kept** beside the outputs, so wall times and
  failures are recoverable. Both existing builds did this (`cactus.log`,
  `build.log`, `rgfa_build.err`, `upload.log`), which is the only reason the
  27.4 h figure and the chrY finding are quotable here at all.
- **Audits that could silently fail are asserted, not eyeballed.** The mouse
  build refuses to proceed on an unexpected `SN` tag or a duplicate segment id
  (`buildJbrowse.sh` exits non-zero on either), and the bovine build checked its
  reconstructed coordinates by summing the HER path against bosTau9's own
  chromosome lengths, 29 for 29. Steps 3 and 4 owe the same.

Step 1 processes no raw data — it touches configs, a gate and a registry only,
so there is nothing to log for it beyond this file.

## Order of work

Open items and their order live in
[handoffs/pangenome-2026-09-09.md](handoffs/pangenome-2026-09-09.md); this
section is the durable shape of the work rather than its state.

Sequenced so nothing waits on the long job. Unnumbered on purpose — the order
has already changed once.

- **Normalize the plumbing.** _Landed 2026-09-09, `0be8ce7f39c`._ Adopted the
  orphaned `mouse-mm39.json` as a committed source (verified byte-identical to
  what is serving); wrote `bovine-arsucd12.json`; moved human's assembly block
  to the mouse shape; renamed `hprc_tier` → `hprc_minigraph_tier` in both the
  config and `pangenomeDataset.ts`; added `check-pangenome-assets` and wired it
  into `gate_configs`. All 62 urls across the three configs resolve.

  The human assembly-block change turned out to be more than cosmetic. Its
  sequence was `hg38.prefix.fa.gz`, whose refnames are bare numeric, while the
  graph's GRCh38 stable names are all `chr`-prefixed — 195 of them, zero
  bare-numeric — so `assemblyNameToPanSN` was composing `GRCh38#0#1` against a
  file holding only `GRCh38#0#chr1`, and whether that resolved depended on the
  plugin undoing it through aliases. Wants a launch check when v5 lands; the
  plugin cannot be exercised from this checkout.

  **Ordering hazard:** `pangenomeDataset.ts` names `hprc_minigraph_tier`, which
  the _live_ config does not have until `website/pangenome-config/upload.sh`
  runs. Upload before deploying, or the whole-chromosome launches name a trackId
  their config lacks. Only staging is affected today, since
  `features.pangenomeGraph` is closed on production.

- **Commit the two builders.** _Landed 2026-09-09, jbrowse-components
  `d89f7c3025`._ `scripts/build_mouse_pangenome.sh` (constructs the graph) and
  `scripts/build_bovine_pangenome.sh` (projects Leonard et al.'s), plus
  `scripts/gfa_paths_to_rgfa.py` — the generalized form of the `make_rgfa.py`
  that produced the live bovine data, with the path names, reference name and id
  step as arguments. Verified equivalent before committing: on chr10 and chr25
  of the real Zenodo graphs the two emit byte-identical output (152,796,350
  bytes) and identical stderr. It also gained two refusals the original lacked —
  a path list that does not match the file, and non-trivial link CIGARs, since
  the offset walk adds segment lengths and a real overlap would shift every
  later coordinate. Rows added to `DEMO_DATASETS.md` §"Pangenome and
  comparative" and `HOSTING.md`.

- **HPRC v2.1, as one atomic pass.** The 14 pins listed above, plus
  `node website/generatePangenomeData.ts` to rebuild the 20 locus summaries
  against the v2.1 `wave` VCF (2,291,014,302 bytes, probed live), plus the four
  download-table rows, whose v2.1 paths differ in shape — upstream added a
  `/v2.1/` directory segment, so each has to be probed rather than
  string-substituted.

- **Bovine's variant route.** `vg convert` + `vg deconstruct -p` per chromosome
  over the minigraph set already extracted, PanSN-renaming each P line first so
  CHROM comes out `chr<k>`, then concatenate, bgzip and tabix. Measured at ~2
  minutes for the corpus. This is the whole bovine gap; base level is explicitly
  not part of it (see above).

  Optionally, and asymmetrically: rebuilding bovine's BEDs through
  `pggb_gfa_to_bed.py` instead of the rGFA producer would carry `SM:Z:` into the
  graph view's node tooltips, which human's rGFA-derived tracks cannot have.
  PANGENOME_GRAPHS.md's rule is "pick the producer that matches your file", so
  that IS the consistent decision applied to a path-bearing input — but it makes
  one dataset show something the others do not, and the VCF above already
  supplies carriage everywhere it is computed on. Decide it on its own merits,
  not as a consistency fix.

- **Mouse's variant route.** `minigraph -cxasm --call` over the 19 assemblies on
  disk, then `mgutils.js merge -r0` for the VCF. Hours. Honest at bubble
  resolution, and it closes the mouse gap on its own — the rebuild below is a
  separate question, not a follow-up to this.

- **Registry-driven `/pangenomes`.** _Landed 2026-09-09, `819c960b0bd` +
  `7d9aa7433c5`._ Both graphs are `PANGENOME_DATASETS` entries, so the explorer,
  the locus dashboard and every launch builder work on all three, and
  `PangenomeSection.astro` renders the mouse and cattle sections off the
  dataset. HPRC's section stayed hand-written for another day — a 232-row sample
  table, two references and a release history that nothing else has — so
  `portal` was optional on the type.

  _Amended 2026-09-10._ It no longer is. `/hubs/HPRC` is a searchable version of
  that sample table and the page's own prose already linked it, and the
  release-history table was a table of upstream files the HPRC resources repo
  maintains — so both became links, and with them gone HPRC is the same shape as
  the other two and renders through the same component. `portal` is required.
  The section gained what it had never had: the projections table, the caveats
  list, and its own region launcher.

  `graphVcf` became optional as planned, and the thing to hold onto is that its
  absence is a property of the FILE rather than a stage of the wiring: mouse's
  rGFA has no `P` or `W` lines, so no callset can be projected from it however
  much else lands. `noCallsetReason` is what the dashboard shows in its place.
  `phased` moved onto the callset in the same pass, having been hardcoded — it
  is right for HPRC's 232 diploid samples and wrong for `vg deconstruct` over 11
  haploid assembly paths, where it draws every second row empty.

  Locus catalogues came from neither seed list in the end: `04d62efa1ec` derives
  them from the graph's own coarse tier, and `locus.derived` carries the four
  numbers the tier reported. Its presence is also the per-locus signal that
  nothing was precomputed — no `<id>.vcfsummary.json` — so the dashboard shows
  the tier's facts rather than a load error over a locus that is working as
  intended.

  One defect worth remembering, because a URL-shape test could not see it:
  `syntenyGene` split a derived locus's COMPOSED label and produced text that is
  not a gene symbol — `Gm10439,` with the comma still on it, `Vmn` out of "Vmn
  cluster (18 genes)", and `chr9:87,086,686` out of an intergenic entry. It
  reads the tier's gene list now and offers no hub link where the bubble names
  no gene. Found by server-rendering the dashboard for every dataset, which is
  the cheap version of the launch check and worth doing after any change here.

- **Optionally, the mouse minigraph-cactus rebuild**, as its own deliberate
  multi-day run. It buys the GBZ route and nothing else — which is a route human
  got from upstream rather than one we built, so there is no parity argument for
  it. Do it if query-time carriage for mouse is wanted for its own sake.

## Coverage facts to surface on the page, not paper over

These are properties of the data and no convention fixes them. They belong in
the per-dataset `notes[]`.

- **Mouse has no chrY.** No strain assembly in the panel has a Y sequence, so
  chrY is a bare reference thread — one segment, zero links — deliberately not
  offered as a whole-chromosome view. chrX carries 18 of 19: C57BL_6J_T2T's
  chromAlias names 238 sequences and none is an X or a Y. The live tier index
  confirms 20 sequences, chr1–chr19 and chrX.
- **Bovine is 29 autosomes only** — the Zenodo sets cover no sex chromosome. Its
  live tier index confirms 29.
- **Bovine rank is a convention.** Ranks 1..11 are P-line order, so
  `discoveryRank` and `firstSeenIn` are weaker than the usual minigraph caveat.
  Once step 3 lands, `SM:Z:` replaces them and the caveat goes.
- **22 of bovine's 153,719 bubbles** sit at `gfatools`' clamp of 2147483647,
  where it means "more paths than I can count", not a measurement.

## Dead references to remove while passing through

- `genark2jbrowse/src/createEnsemblMouseChainTracks.ts:13` — `PANGENOME_VCF_URI`
  names a 404 from the abandoned March build. Either point it at step 4's VCF or
  delete it.
- `pangenome-build/` — the impg route for the same 19-strain panel. Its
  expensive half ran (987 MB `panel.paf`, indexed `panel.impg`, 2026-06-29) and
  its per-locus MSA step never did; 47 GB idle at
  `/mnt/sdb/cdiesh/mousePangenome/` plus its own build tree. Its
  `mouse-loci.tsv` is worth keeping for step 5 regardless. Retire or finish, but
  do not leave it as a third half-built mouse route.

  The case for finishing it got weaker on 2026-09-10: the site's per-locus MSA
  panel is deleted (see CLAUDE.md, "What the /pangenomes page is not"), so the
  step that never ran no longer has a consumer. Retiring is now the default.

- `agent-docs/MOUSE_PANGENOME_PLAN.md` — superseded by this file for everything
  except its locus table. Its §3 parameterisation plan is done.
