---
name: pangenome-portal
description:
  The data side of /pangenomes — how the human, mouse, cattle and Arabidopsis
  graphs are built and published by one approach, which routes each graph can
  serve, and the measurements behind the haplotype forms. Read before touching a
  pangenome dataset, config or sidecar.
---

# Four pangenomes, one approach

The page side (launches, the box, the lane rules) is
`agent-docs/reference/PANGENOME_PAGES.md`. Why the configs live in this repo is
`agent-docs/architecture-decision-records/0006-pangenome-configs-stay-in-this-repo.md`.
Open work is `agent-docs/ideas/collections/pangenome-followups.md`.

## Three routes off one graph

A graph reaches a reader through three routes, and they are not alternatives of
equal power.

| route                   | artifact                                                                | what it can say                                           |
| ----------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| BED projections         | `segs`+`links`, `bubbles`, `alleles`, the `tier10000`/`fold10000` tiers | browse by locus, hover sync, the coarse tier above 150 kb |
| reference-projected VCF | `vg deconstruct` / vcfwave / `mgutils merge`                            | the multi-sample matrix and the structural forms          |
| query-time walks or GBZ | walk files, or `.gbz.db` + haplotype index                              | the above **plus carriage and per-haplotype alignment**   |

rGFA and a P/W-line GFA differ only in how they encode coordinates: rGFA states
`SN`/`SO`/`SR` per segment, and a path GFA states the same thing in path order.
One normalized BED pair therefore serves both, and `RgfaTabixAdapter`
reconstructs a synthetic rGFA from it. jbrowse-components'
`agent-docs/reference/PANGENOME_GRAPHS.md` is the authority for the graph half.

**Every adapter in this stack lives in the graphgenomeviewer plugin, not core**:
`RgfaTabixAdapter`, `MinigraphBubbleAdapter`, `GbzBaseSyntenyAdapter` and
`WalkTabixSyntenyAdapter`. The plugin boots only on jbrowse-web `main`, so every
launch targets `JBROWSE_BASE` (`main`), and pointing that at a release
error-pages every graph launch; the repo `CLAUDE.md` holds the rule.

## The file set every graph publishes

Each of the four graphs publishes the same files under the same suffixes,
range-served:

```
<prefix>.segs.bed.gz          <prefix>.bubbles.bed.gz
<prefix>.links.bed.gz         <prefix>.alleles.bed.gz
<prefix>.tier10000.segs.bed.gz
<prefix>.fold10000            (the graph track's coarse tier)
```

| dataset     | prefix                                                     |
| ----------- | ---------------------------------------------------------- |
| human       | `demos/hprc/hprc-v2.1-mc-grch38`                           |
| mouse       | `demos/mouse_pangenome/mouse-mm39-minigraph`               |
| bovine      | `demos/bovine_pangenome/bovine-arsucd12-minigraph`         |
| arabidopsis | `demos/arabidopsis_pangenome/arabidopsis-tair10-minigraph` |

`build_rgfa_tabix.sh`, `build_rgfa_alleles.sh` and `build_bubble_tier.sh` in
jbrowse-components build the projections for every graph. The `.fold10000` tier
is each graph with variants under 10 kb folded into the reference, the same fold
the plugin runs on what it draws, so the handover at 1000 bp per pixel does not
change the picture (18f37b8). The `.tier10000` files draw one node per bubble
and remain the bubble lane's coarse tier.

## The conventions they share

| dimension              | rule                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| bucket prefix          | `demos/<species>_pangenome/`; human keeps `demos/hprc/`                                              |
| basename               | `<dataset>-<ref>-<method>`, versioned iff upstream is                                                |
| rGFA                   | published beside the BEDs, since it makes them reproducible                                          |
| assembly block         | TwoBit plus the reference's mirrored sidecars, `chr` refnames (Arabidopsis rides GenArk)             |
| tier trackId           | `<p>_minigraph_tier`                                                                                 |
| config source of truth | `website/pangenome-config/<name>.json`, published by `upload.sh`                                     |
| build script           | committed in jbrowse-components `scripts/` (`build_mouse_pangenome.sh`, `build_bovine_pangenome.sh`) |

**The human assembly block uses `chr` refnames because the graph does.** The
earlier sequence, `hg38.prefix.fa.gz`, had bare-numeric refnames, while all 195
of the graph's GRCh38 stable names are `chr`-prefixed, so `assemblyNameToPanSN`
composed `GRCh38#0#1` against a file holding only `GRCh38#0#chr1`.

**The `hg38` and `hs1` trackIds still say v2.0 on purpose.** Published links and
saved sessions name them, and a renamed trackId does not error: the track just
never opens. Names and descriptions moved to v2.1; an id is not a claim.

## Bumping a dataset version

`pnpm check-pangenome-assets` resolves every adapter url in
`website/pangenome-config/*.json`, asserts each config is served at the url the
site links byte-for-byte as committed, and reports a newer published upstream
version as STALE. `run.sh` runs it in `gate_pangenome_configs` (with
`--allow-unpublished`, since the run publishes next) before `upload.sh`, on the
staging path too. A config here goes stale from a push upstream, which no
push-triggered CI here can see, so this check is the only thing that notices.

- **Probe the new version's urls, never substitute strings.** HPRC v2.1 lives
  one directory deeper than v2.0, under `/v2.1/<basename>/`.
- **Bump the config and the page's download tables together.**
- **`check-pangenome-launches --local` answers each config url with the working
  tree file**, so a bump is tested before `upload.sh` runs.

## Carriage, and which graphs have it

**Carriage** is the per-node sample set: which haplotypes' paths walk through a
node. It separates "this allele exists somewhere in the panel" from "these 7 of
19 strains have it". The plugin renders it as `carriedBy`; `pggb_gfa_to_bed.py`
writes it into the BED as `SM:Z:`, and the GFA parser reads it into
`GraphNode.samples`.

Rank is not carriage. rGFA's `SR` records the construction generation at which
minigraph added a segment, so it can say "first seen in the Nth assembly
processed" and nothing about which others carry the segment. The bovine README
writes "never carriage" about its own `firstSeenIn` column for that reason.

Whether a graph can recover carriage depends on whether it records haplotype
paths:

- **human: yes.** The minigraph-cactus graph carries 464 haplotype walks. HPRC
  publishes the `.gbz.db` (10,050,412,544 bytes), and the companion haplotype
  index, format 3 (the only one `@gmod/gbz-base` 7 reads), is ours at
  `demos/hprc/hprc-v2.1-mc-grch38.haplotype-index.f3.db`.
- **bovine: yes, in the callset only.** The Zenodo source GFA carries 12 P lines
  per chromosome (`Zenodo/minigraph/10.gfa`: 1 H, 15,349 S, 21,854 L, 12 P), on
  disk under `/mnt/sdb/cdiesh/bovinePangenome/Zenodo/minigraph/`. The BEDs went
  through the reconstructed rGFA and `gfatools gfa2bed`, which drops `SM:Z:`, so
  their `firstSeenIn`/`discoveryRank` is P-line order. `vg deconstruct` over the
  same GFAs gives the callset its per-breed genotypes.
- **mouse: no, structurally.** A line-type census of the 3.3 GB
  `mouse-mm39-minigraph.rgfa` finds `H`, `S` and `L` only: zero P or W lines.
  `minigraph -cxggs` emits no haplotype paths, so `firstSeenIn` is construction
  order. `~/mousePangenome/createMousePangenome.sh` (cactus-pangenome over the
  same 19 assemblies, which emits paths) never ran: its `cactus.log` is 148
  bytes from 2026-03-21.
- **Arabidopsis: no**, for mouse's reason.

## SV resolution is the target, not base level

The four graphs serve the graph route at parity: SV resolution, from a minigraph
rGFA. The HPRC tutorial reads `sv.gfa` (`*.sv.gfa.gz`, 842 MB) and deliberately
not the base-level `*.gfa.gz` (63 GB): "the `sv.gfa` is the graph route; the VCF
is the variant route." The arithmetic agrees: the projections run about 9.6
bytes a segment (bovine 425,796 segments → 4.07 MB; mouse 1,321,274 → 12.3 MB),
so human's 6.69 MB `segs.bed.gz` holds on the order of 700,000 segments, where a
base-level 464-haplotype graph has several hundred times that. `SV_FILTER` in
`pangenomeLinks.ts` (`alleleLength(feature)>=50`) shows only the structural tier
anyway.

A base-level bovine graph would come from `Zenodo/cactus` or `Zenodo/pggb` (29
files each, 26.1 GB and 23.7 GB, never extracted) and would make cattle more
detailed than the reference implementation, on a route that implementation
declined.

## Which routes each graph serves

|             | graph route              | variant route                               | walk/GBZ route                             |
| ----------- | ------------------------ | ------------------------------------------- | ------------------------------------------ |
| human       | v2.1 `sv.gfa`            | HPRC `wave`, split and filtered here        | walk files; upstream `.gbz.db` + our index |
| bovine      | Leonard et al. minigraph | `vg deconstruct`, run here                  | none; nobody publishes one                 |
| mouse       | built here               | none: needs `minigraph --call` per assembly | none: needs a minigraph-cactus rebuild     |
| arabidopsis | built here               | none                                        | none                                       |

**The bovine callset** came from `vg convert -g <chr>.gfa -p` and
`vg deconstruct -p HER -a` per chromosome. On `25.gfa` (43.9 MB) that took 1.6 s
and 0.42 s and gave 2,593 records with `AF` and a GT column per assembly
(`ANG BIS BRA BSW GAU HIG NEL OBV PIE SIM YAK`); the corpus extrapolates to
about two minutes. `deconstruct` names CHROM after the path it was given, so
rename the P line to the PanSN form first (the mapping `gfa_paths_to_rgfa.py`
applies) and one rule names both files' sequences. Its genotypes are haploid, so
`graphVcf.phased` is unset there.

## The GBZ route, measured

`@gmod/gbz-base` ([GMOD/gbz-base-js](https://github.com/GMOD/gbz-base-js), one
dependency, `generic-filehandle2`) is a pure TypeScript reader that pulls SQLite
pages out of the `.gbz.db` by HTTP range request. From node on 2026-09-10,
against the two published files:

| call                                           | result                    | time  |
| ---------------------------------------------- | ------------------------- | ----- |
| `GBZBase.open` (10.0 GB db + 7.9 GB index)     | —                         | 0.32s |
| `getAlignmentsForRange`, `keep` = the demo's 8 | 16 records                | 1.40s |
| `getAlignmentsForRange`, no filter             | **468 records**           | 0.34s |
| `getSubgraphForRange`                          | 7,088 nodes, 469 paths    | 0.21s |
| `toSubgraphJson`                               | —                         | 0.04s |
| `paths()`                                      | 53,150 paths, 233 samples | 1.01s |

- **All 464 haplotypes answer in a third of a second** over a 105 kb window, so
  the adapter does not limit the lane count; height does (below).
- **The records carry per-haplotype alignment.** The CFHR window returns
  `HG01123#1#CM089081.1[191896727-191917111]` with CIGAR
  `6605M4D3940M2D349M1D3594M84684D405M1I4226M1D1264M`: the 84,684 bp deletion is
  the CFHR3–CFHR1 deletion, in that haplotype's own contig coordinates.
- **`haplotypeLength(handle)` is the fragment length, not the contig length.**
  `pathsForSample('HG00097')` returns 210 fragments, five on `CM094060.1`, and
  `name.fragment` is the offset into the contig. A per-haplotype `chrom.sizes`
  is `max(fragment + length)` per contig.

The Haplotypes launch reads the walk files (`hprc_v2_1_walk_lanes`,
`WalkTabixSyntenyAdapter`) since 9b7c06e: 5 requests a window where the gbz-base
track took 23 to 57. `hprc_v2_1_gbz_lanes` stays in the config for links that
name it.

## Which haplotypes a window opens on

`structuralForms` (`pangenomeSvStates.ts`) groups a window's haplotypes by their
states in the sidecar, and `structuralPanel` (`pangenomePanels.ts`) keeps one
per form, commonest first: every form where there are at most
`COMPLETE_PANEL_SIZE` (10), the commonest `PANEL_SIZE` (8) otherwise.

**Height sets those numbers, not load time**, measured 2026-09-17 on ada. Warm
AMY1 launches settle in about 5.0 s at 8 and 9 lanes, 5.2 s at 12 and 5.2 to 5.5
s at 16. Each lane adds about 53 px; eight lanes and the reference end 760 px
down a 1440×900 window, and ten end at 865 px, inside a 1080p window.

**The sidecar does not filter on `LV=0`**, because `LV=0` is not "top level" in
the release's callset. vcfbub removed every snarl with an allele over 100 kb and
kept its children, so at `hp` all 448 LV=1 records hang off a snarl with no
record, including a 1,716 bp deletion 190 of 461 haplotypes carry, while the one
LV=0 record is a 302 bp deletion carried by 5. The old per-locus panels, which
filtered on it, gave 15 of the 20 curated loci a panel; the genome-wide sidecar
gives 19, and rhd, smn, defb and ugt2b17 each gain theirs on the deletion the
filter hid. srgap2's window holds no structural record at all.

**Which member stands for a form** is free, since every member draws the same
structure, so the pick is the alphabetically first whose lane would draw gene
models. Only HG002's two haplotypes lack an annotation, which is why
`haplotypesWithoutGenes` is on the dataset rather than derived.

## The sidecar's no call is two states

Format `v2` of the sidecar (`buildHprcSvStates.sh`, 2026-10-08) separates `_`, a
no call under a snarl that calls the haplotype, from `.`, a haplotype no snarl
above calls. Format v1 wrote `.` for a deletion spanning the site, a route
through a removed parent and a haplotype the graph does not place alike.

The removed parent is the record that separates the cases. Of the 426 snarls
vcfbub removed, 118 have a reference allele under 100 kb and an alternate over
it. The release's `raw.vcf.gz` still has them, and at a parent a placed
haplotype has an allele with a length while an unplaced one is missing. At five
windows on 2026-10-08:

| Case                                             | Answer                       | Evidence                                                                                                                                                                    |
| ------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| defb, HG00097#1, chr8:7,850,001-7,930,000        | not placed                   | Of the old form's 395 walks, 210 have no reference step in the window, 181 are placed for about 66 kb and stop at 7,916,670, and 4 cross. The 5.2 Mb parent calls 1 of 462. |
| nphp1, HG00544#1, chr2:110,080,001-110,210,000   | not placed, sequence present | Its walk ends at reference 109,975,357 and resumes at 110,276,210 on one contig: the graph clipped the stretch. Missing at the 346 kb parent.                               |
| FLNA, HG00126#1, chrX:154,340,001-154,440,000    | not placed, no chrX          | Missing at all 537 top-level raw records, as are all 116 of its form.                                                                                                       |
| AMY1, form of 255, chr1:103,610,001-103,760,000  | placed, mostly three copies  | At the 176 kb parent 165 are within 142 bp of the reference length, 52 are 94 kb shorter, 12 are missing.                                                                   |
| UGT2B17, form of 229, chr4:68,530,001-68,680,000 | deletion, 117,313 bp         | All 229 carry a -117 kb allele at the 117 kb parent.                                                                                                                        |

Three other sources lost to the raw callset:

- **The haplotype walks** (`….walks.bed.gz`) give placement exactly and the
  wrong answer for a deletion: at AMY1 247 of the 255 step over 94 kb of
  reference, yet only 52 are 94 kb shorter, because the other copies sit on
  non-reference nodes.
- **The MAF summary** (`….summary.bed.gz`, 1.7 MB) reproduces defb's 210 / 181 /
  4 split in a 9 to 37 KB read, and cannot tell a deletion from a clipped
  stretch.
- **The wave and pgbi callsets** hold nothing the sidecar lacks: no `*` allele,
  no parent.

The build, on ada:

- **426 removed snarls read, 422 restored.** The kept rows name 425 parents and
  those name 1 more; 4 fall under `MIN_CARRIERS` called haplotypes. Each read is
  one `bcftools query` over the span of the parent's children, 4 at a time:
  about 13 minutes for the first 416, which the script caches as allele lengths.
  vcfwave moves a record, so a read at the first child's position alone missed
  10 of the 425.
- **581,424 of 8,169,115 no-call states are `_`** (7.1%), over 16,671 rows. The
  file went from 388,147 rows and 18,520,683 bytes to 388,569 and 18,594,890.
- **A restored row's state is a residual.** With the parent's whole size change
  as its state, HP's 184 read "1.7 kb deletion, 1.7 kb deletion" and pga's 105
  "19 kb insertion, 19 kb insertion", once at the child and once at the parent.
- **The 1 kb floor (`RESTORED_STRUCTURAL_BP`) holds genome-wide**: the median
  restored row has 448 of 462 haplotypes at the reference's structure, and 248
  of 422 have no size 5 haplotypes share. 43 rows have 10 or more such sizes (39
  at chr1:16,537,879), loci where size is a continuum; SMN's 1.6 Mb parent is
  one, with 23.

**The residual's assumption, that the rows under a parent sum to its allele,
holds where the build cache can say.** Over the 422 restored parents, counting a
haplotype only where every row under the parent calls it (143,288
haplotype-parent pairs; the other 26,510 take another route, which is what the
residual is for):

- 132,473 pairs (92.5%) leave a residual under 1 kb, so the parent's row reads
  as the reference's structure; 209 of the 395 parents with such pairs have no
  other kind.
- Of the 37,096 pairs whose rows sum to 1 kb or more, the parent is within 1 kb
  of the sum at 30,975. At 189 the parent is under 1 kb itself, the one case
  that says the rows do not sum, and its row then carries a size the haplotype
  does not have: 134 of those are at two nested parents on
  chr8:6,978,932-7,017,149, in the 8p23.1 defensin cluster, and 27 at
  chr11:89,829,976-90,036,616.
- The other 5,932 have a parent and rows that are both large and differ. The
  rows are structural records only, so a route that differs at no such row looks
  the same as rows that fail to sum, and the cache cannot say which.

A haplotype counts as not placed only with no call at any row of the window.
Dropping the form whose key is `.` at every informative site instead took AMY1's
12, which are missing at the 176 kb parent and called at other rows; they are a
form of their own, "not aligned at 65 sites". The 22 examples had such
haplotypes at five: defb 390, flna 116, smn 96, nphp1 5 and hba 2.

What v2 changed at the 22 examples; the 12 not listed (c4, hp, cyp2d6, hba,
srgap2, mns, cfhr, prss, gstm1, gstt1, pga, flna) kept their lanes:

| Example | v1                                                                  | v2                                                                                            |
| ------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ugt2b17 | 232 as the reference, 229 skips 8 sites                             | 232 as the reference, 229 120 kb deletion                                                     |
| rhd     | 371 as the reference, 86 skips 8 sites, 5 two insertions            | 371 as the reference, 86 70 kb deletion, 5 two insertions                                     |
| amy1    | 255 skips 64 sites, 107 skips 1 site, 78 79 bp deletion; 5 forms    | 171 as the reference, 52 94 kb deletion, 45 94 kb insertion; 14 forms                         |
| defb    | 395 skips 1 site (empty lane), 67 as the reference                  | 67 as the reference, 5 a rarer change; 390 no lane                                            |
| nphp1   | 329 skips 1 site, 67 as the reference; 6 forms, one an empty lane   | 326 not aligned at 2 sites, 43 as the reference, 24 39 kb deletion; 7 forms, 5 no lane        |
| lpa     | 44 skips 27 sites, 37 11 kb insertion and skips 13; 25 forms        | 20 78 kb insertion, 12 78 kb insertion, 11 78 kb and 11 kb insertions; 27 forms               |
| kir     | 2 of 8 lanes skip 9 and 40 sites                                    | the same forms, sized: a 15 kb deletion among 6 changes, a 79 kb deletion among 7             |
| fcgr    | 2 of 8 lanes skip 9 sites                                           | the same forms, each with an 81 kb deletion                                                   |
| mhc-hla | 3 of 8 lanes skip sites (180, 1, 1); 34 forms                       | 2 of 8 lanes not aligned at 1 site; 34 forms                                                  |
| smn     | 379 skips 3 sites, 46 as the reference, 31 3.6 kb deletion; 3 forms | 97 a rarer change, 30 and 26 not aligned at 1 site, then 240, 250, 190 kb deletions; 24 forms |

SMN reads busier under v2, the one example the change does not improve at a
glance. Its three sites sit in a 1.6 Mb snarl that 283 haplotypes cross on other
routes, 157 are not called at, and whose routes come in over 60 sizes; v1's "379
skips 3 sites" was those 283 and 96 the graph does not place, under one lane. A
restored row wider than the window still counts, because a deletion spanning a
small window is exactly that case.

## Per-haplotype gene models

HPRC's release 2 CAT annotation has to be rehosted rather than pointed at: each
file on S3 is plain gzip in gene order, so no index can be built over it where
it sits. Rehosted as CAT publishes it, one haplotype is 129 MB bgzipped, 59 GB
for all 462, and nearly all of that is not gene models: CAT keeps ~5 transcripts
per gene and repeats a ~30-field attribute block on every exon and CDS row, 3.3
million of them. Measured on HG00097#1 on 2026-09-17, the same transcripts as
BED12 are 14 MB, one transcript per gene 3.4 MB, and one per protein-coding gene
1.5 MB; bigBed came out larger than bgzipped BED at every size. A lane draws one
model per gene, so `buildHprcGenes.sh` publishes the 3.4 MB form for every
haplotype, ~1.6 GB in all. Projecting hg38's genes through each lane's alignment
would need no hosting, but it is viewer work and would miss the genes a
haplotype carries that the reference lacks.

Every haplotype has an assembly, because a lane can be any haplotype. The
assemblies' `chrom.sizes` come from the `.fai` HPRC publishes beside each
bgzipped FASTA, whose contigs are PanSN-prefixed (`HG00126#1#CM090108.1`) where
the graph and the annotation name them bare. The FASTA therefore cannot serve as
an assembly's sequence without an alias file per haplotype.

## Nothing reaches the bucket without a committed script and a README

An invariant, not a preference. The mouse and bovine data served from 2026-09-02
with the only record of how they were made in shell scripts on one build box
under `/mnt/sdb`, outside git, until jbrowse-components d89f7c3025 committed the
builders.

For any step that processes raw data:

- **The build script is committed before the data is uploaded**, in
  jbrowse-components `scripts/` beside `build_rgfa_tabix.sh`. HOSTING.md's "Demo
  assets drift from their build scripts" section is the standing warning.
- **A `README.txt` ships beside the data in the bucket**, carrying the source
  and its checksums, what was modified and why, the tool versions, the exact
  commands, the audits run and their results, and the caveats a reader would
  otherwise misread. `demos/{mouse,bovine}_pangenome/README.txt` are the model:
  the bovine one's "Rank above 0 is a CONVENTION, not a measurement" paragraph
  is invisible from the data and wrong to omit.
- **The run's log is kept** beside the outputs (`cactus.log`, `build.log`,
  `rgfa_build.err`, `upload.log`), so wall times and failures are recoverable.
- **Audits that could silently fail are asserted, not eyeballed.** The mouse
  build exits non-zero on an unexpected `SN` tag or a duplicate segment id, and
  the bovine build checked its reconstructed coordinates by summing the HER path
  against bosTau9's chromosome lengths, 29 for 29.

## Coverage facts

Properties of the data that no convention fixes. The tutorials record them; the
pages carry no caveat prose.

- **Mouse has no chrY.** No strain assembly in the panel has a Y sequence, so
  chrY is a bare reference thread (one segment, zero links). chrX carries 18 of
  19: C57BL_6J_T2T's chromAlias names 238 sequences and none is an X or a Y. The
  tier index holds 20 sequences, chr1–chr19 and chrX.
- **Bovine is 29 autosomes only**; the Zenodo sets cover no sex chromosome.
- **Bovine rank is a convention.** Ranks 1..11 are P-line order, so
  `discoveryRank` and `firstSeenIn` are weaker than the usual minigraph caveat.
- **22 of bovine's 153,719 bubbles** sit at `gfatools`' clamp of 2147483647,
  which means "more paths than I can count", not a measurement.
- **A gene track is per dataset** (`geneTrackId`): bosTau9 publishes no
  `ncbiRefSeqSelect`.
- **CloudFront matches an invalidation wildcard only as the last character**,
  which is why `upload.sh` invalidates `/pangenome/*`.
