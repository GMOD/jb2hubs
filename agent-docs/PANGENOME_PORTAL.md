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

| dimension                | human                                                                                             | mouse                                                      | bovine                      | target                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------- | ----------------------------------------------------- |
| bucket prefix            | `demos/hprc/`                                                                                     | `demos/mouse_pangenome/`                                   | `demos/bovine_pangenome/`   | one scheme; `demos/<species>_pangenome/`              |
| basename                 | `hprc-v2.1-mc-grch38`                                                                             | `mouse-mm39-minigraph`                                     | `bovine-arsucd12-minigraph` | `<dataset>-<ref>-<method>`, versioned iff upstream is |
| rGFA published beside    | no                                                                                                | yes, 911 MB                                                | yes, 760 MB                 | always (it is what makes the BEDs reproducible)       |
| assembly block in config | bgzip FASTA at `genomes/GRCh38/`, **bare-numeric refnames**, alias file on raw `s3.amazonaws.com` | TwoBit + `jbrowse.org/ucsc/mm39/` sidecars, `chr` refnames | none yet                    | **the mouse shape**                                   |
| tier trackId             | `hprc_tier`                                                                                       | `mouse_minigraph_tier`                                     | —                           | `<p>_minigraph_tier`                                  |
| config source of truth   | `website/pangenome-config/hprc-grch38.json`                                                       | **orphan in the bucket, no source in any repo**            | **none**                    | all three in `website/pangenome-config/` (below)      |
| build script             | committed in jbrowse-components `scripts/`                                                        | `/mnt/sdb`, uncommitted                                    | `/mnt/sdb`, uncommitted     | committed in `scripts/`                               |

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

The tutorials moved to HPRC **v2.1**. This repo is entirely on **v2.0** — 14
pins across four files:

- `website/pangenome-config/hprc-grch38.json` — all six track URIs
- `website/src/components/pangenomeDataset.ts` — `graphVcf.url` and its trackId
- `ucsc2jbrowse/ucscExtensions/hg38.json` — the served VCF and the allele
  inventory
- `website/src/pages/pangenomes/index.astro` — the four download-table rows

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

## The barrier, stated exactly

Maximum alignment means all three on the GBZ route. Two of the three have no
barrier; one does.

- **bovine: no barrier, and an upgrade already on disk.** Its P-line GFA
  converts to a GBZ directly (`vg` 1.76.1 and `gbz-base` 0.6.1 with `gbz2db` are
  both installed, and the same loop is already exercised end to end for E. coli
  in `~/ecoli-gbz-oracle/`: `ecoli.gbz`, `ecoli.gbz.db`,
  `ecoli.haplotype-index.db`). Better still, the 12 GB
  `Zenodo_pangenomes.tar.gz` holds **base-level `cactus/` (29 files, 26.1 GB)
  and `pggb/` (29 files, 23.7 GB) sets that were never extracted** — only
  `Zenodo/minigraph` was. A base-level bovine graph is the true peer of human's
  minigraph-cactus one, and it needs no new download.
- **mouse: a real barrier.** A GBZ is a GBWT over haplotype paths; with zero
  paths there is nothing to index, and `gbz-base`'s entire value is querying
  walks. There is no way to make a GBZ _of the graph we display_. The two ways
  out both cost something:
  - **Rebuild with minigraph-cactus** — the March script. Correct, and gives
    paths, a VCF and a HAL in one pass. The plain-minigraph run alone was 27.4 h
    of wall time over 21 chromosomes two at a time; MC adds base-level alignment
    per chromosome on top, so this is a multi-day job on one box and the March
    attempt is evidence it is not turnkey. It is a run to start deliberately,
    the way the PIF regeneration was.
  - **`minigraph --call` per assembly, then a VCF-derived graph.**
    `minigraph -cxasm --call -t16 graph.gfa sample-asm.fa` gives each assembly's
    traversal of every bubble, and `misc/mgutils.js merge -r0` combines the
    calls **and generates a VCF** (both documented in
    `~/src/minigraph/README.md`). All 19 assemblies are already downloaded, 30
    GB in `/mnt/sdb/cdiesh/mousePangenome/fasta/`, so this is hours.
    `vg autoindex` over that VCF would then yield a GBZ — but a graph built
    _from the VCF_, not the minigraph graph, so mouse would display one object
    and query another. That trades one inconsistency for a subtler one.

So: `--call` is the right cheap step because its carriage and its VCF are honest
at bubble resolution and they unblock the page. It is not a substitute for the
cactus rebuild, and it should not be described as one.

## The target, per dataset

|        | graph                                               | carriage                              | VCF                     | GBZ                        |
| ------ | --------------------------------------------------- | ------------------------------------- | ----------------------- | -------------------------- |
| human  | HPRC v2.1, upstream                                 | `.gbz.db` (have)                      | HPRC `wave` v2.1 (have) | have, upstream + our index |
| bovine | base-level cactus or pggb, from the tarball on disk | `SM:Z:` via `pggb_gfa_to_bed.py`      | `vg deconstruct`        | `vg` → `gbz2db`            |
| mouse  | **minigraph-cactus rebuild**                        | `--call` now; walks after the rebuild | `mgutils merge -r0` now | only after the rebuild     |

That is one recipe with one honest exception, and the exception is scheduled
rather than permanent.

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

Sequenced so nothing waits on the long job.

1. **Normalize the plumbing.** _Landed 2026-09-09._ Adopted the orphaned
   `mouse-mm39.json` as a committed source (verified byte-identical to what is
   serving); wrote `bovine-arsucd12.json`; moved human's assembly block to the
   mouse shape; renamed `hprc_tier` → `hprc_minigraph_tier` in both the config
   and `pangenomeDataset.ts`; added `check-pangenome-assets` and wired it into
   `gate_configs`. All 62 urls across the three configs resolve.

   **The v2.1 bump was deliberately NOT included.** It is not a url edit: the
   committed per-locus summaries under `website/public/pangenome/` are derived
   from the v2.0 VCF, so bumping the config without regenerating them would
   leave the charts describing one file and the launches opening another —
   strictly worse than being consistently a version behind. It is step 1b, and
   it processes raw data, so it owes the section above. `check-pangenome-assets`
   now reports the gap on every run rather than letting it stay silent.

   **Ordering hazard from this step:** `pangenomeDataset.ts` names
   `hprc_minigraph_tier`, which the _live_ config does not have until
   `website/pangenome-config/upload.sh` runs. Upload before deploying, or the
   whole-chromosome launches name a trackId their config lacks. Only staging is
   affected today, since `features.pangenomeGraph` is closed on production.

1b. **HPRC v2.1, as one atomic pass.** The 14 pins listed above, plus
`node website/generatePangenomeData.ts` and `generatePangenomeMsa.ts` to rebuild
the 20 locus summaries and MSAs against the v2.1 `wave` VCF (2,291,014,302
bytes, probed live), plus the four download-table rows, whose v2.1 paths differ
in shape — upstream added a `/v2.1/` directory segment, so each has to be probed
rather than string-substituted. 2. **Commit the two builders** into
jbrowse-components `scripts/` as `build_mouse_pangenome.sh` and
`build_bovine_pangenome.sh`, with rows in `DEMO_DATASETS.md` §"Pangenome and
comparative" and `HOSTING.md`. Two published datasets currently have no
reproducible provenance in git, which is the hazard HOSTING.md's own "Demo
assets drift from their build scripts" section names. 3. **Bovine to base level
with carriage.** Extract `Zenodo/cactus` (or `pggb`), rebuild the BEDs through
`pggb_gfa_to_bed.py` so `SM:Z:` survives, `vg deconstruct` for the VCF, then
`vg` → `gbz2db` for the `.gbz.db` and its haplotype index. No new downloads. 4.
**Mouse `--call` pass** over the 19 assemblies on disk, then `mgutils merge -r0`
for the VCF, and rebuild its BEDs with the carriage the calls provide. 5.
**Registry-driven `/pangenomes`.** `pages/pangenomes/index.astro` is 529
hand-written lines that read `PANGENOME_DATASETS` not at all. Extend
`PangenomeDataset` with what the page hardcodes — species and common name,
graph-file table rows, sample-table source, outbound portal links, a `notes[]`
for the coverage caveats — and loop one section component. Locus catalogs are
seeded: the bovine README lists 8 windows with gene and insertion size,
`pangenome-build/mouse-loci.tsv` has 9 anchor-gene mouse loci. 6. **Start the
mouse minigraph-cactus rebuild** as its own deliberate run. Only after it lands
does mouse get walks, a base-level graph and a GBZ, and only then is the
exception in the table above gone.

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
- `agent-docs/MOUSE_PANGENOME_PLAN.md` — superseded by this file for everything
  except its locus table. Its §3 parameterisation plan is done.
