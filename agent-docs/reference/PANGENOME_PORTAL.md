---
name: pangenome-portal
description:
  The data side of /pangenomes — how the human, mouse, cattle and Arabidopsis
  graphs are built and published by one approach, which routes each graph can
  serve, and the measurements behind the haplotype forms. Read before touching a
  pangenome dataset, config or sidecar.
---

# Four pangenomes, one approach

The page side (launches, the box, the lane rules) is in
`agent-docs/reference/PANGENOME_PAGES.md`. ADR
`agent-docs/architecture-decision-records/0006-pangenome-configs-stay-in-this-repo.md`
records why the configs are kept in this repo. Open work is in
`agent-docs/ideas/collections/pangenome-followups.md`.

## Three routes off one graph

A graph reaches a reader through three routes, which differ in what they can
show:

| route                   | artifact                                                                | what it can show                                                              |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| BED projections         | `segs`+`links`, `bubbles`, `alleles`, the `tier10000`/`fold10000` tiers | browse by locus, hover sync, the coarse tier above 150 kb                     |
| reference-projected VCF | `vg deconstruct` / vcfwave / `mgutils merge`                            | the multi-sample matrix and the structural forms                              |
| query-time walks        | walk files (`gfa-to-tabix --walks`)                                     | the above **plus the haplotypes through each node and each haplotype's path** |

rGFA and a P/W-line GFA differ only in how they encode coordinates: rGFA states
`SN`/`SO`/`SR` per segment, and a path GFA states the same thing in path order.
One normalized BED pair therefore serves both, and `RgfaTabixAdapter`
reconstructs a synthetic rGFA from it. jbrowse-components'
`agent-docs/reference/PANGENOME_GRAPHS.md` is the authority for the graph half.

**Every adapter in this stack is defined in the graphgenomeviewer plugin**:
`RgfaTabixAdapter`, `MinigraphBubbleAdapter` and `WalkTabixSyntenyAdapter`, none
in core. The plugin boots only on jbrowse-web `main`, so every launch targets
`JBROWSE_BASE` (`main`), and pointing that at a release turns every graph launch
into an error page. The repo `CLAUDE.md` holds the rule.

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
the plugin runs on what it draws, so the picture stays the same across the
handover at 1000 bp per pixel (18f37b8). The `.tier10000` files draw one node
per bubble and remain the bubble lane's coarse tier.

## The conventions they share

| dimension              | rule                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| bucket prefix          | `demos/<species>_pangenome/`; human keeps `demos/hprc/`                                              |
| basename               | `<dataset>-<ref>-<method>`, versioned iff upstream is                                                |
| rGFA                   | published beside the BEDs, since it makes them reproducible                                          |
| assembly block         | TwoBit plus the reference's mirrored sidecars, `chr` refnames (Arabidopsis uses the GenArk assembly) |
| tier trackId           | `<p>_minigraph_tier`                                                                                 |
| config source of truth | `website/pangenome-config/<name>.json`, published by `upload.sh`                                     |
| build script           | committed in jbrowse-components `scripts/` (`build_mouse_pangenome.sh`, `build_bovine_pangenome.sh`) |

**The human assembly block uses `chr` refnames because the graph does.** The
earlier sequence, `hg38.prefix.fa.gz`, had bare-numeric refnames, while all 195
of the graph's GRCh38 stable names are `chr`-prefixed, so `assemblyNameToPanSN`
composed `GRCh38#0#1` against a file holding only `GRCh38#0#chr1`.

**The `hg38` and `hs1` trackIds still say v2.0 on purpose.** Published links and
saved sessions name them, and a renamed trackId raises no error: the track never
opens. Names and descriptions moved to v2.1, because an id makes no claim about
the version.

## Bumping a dataset version

`pnpm check-pangenome-assets` resolves every adapter url in
`website/pangenome-config/*.json`, asserts each config is served at the url the
site links byte-for-byte as committed, and reports a newer published upstream
version as STALE. `run.sh` runs it in `gate_pangenome_configs` (with
`--allow-unpublished`, since the run publishes next) before `upload.sh`, on the
staging path too. A config here falls out of date when upstream pushes, which no
push-triggered CI in this repo can see, so this check is the only one that
reports it.

- **Probe the new version's urls instead of substituting strings.** HPRC v2.1 is
  one directory deeper than v2.0, under `/v2.1/<basename>/`.
- **Bump the config and the page's download tables together.**
- **`check-pangenome-launches --local` answers each config url with the working
  tree file**, so a bump is tested before `upload.sh` runs.

## Carriage: which graphs record the haplotypes through each node

A graph that records haplotype paths can list, for each node, which haplotypes
walk through it. That list tells "this allele exists somewhere in the panel"
apart from "these 7 of 19 strains have it". The plugin renders the list as
`carriedBy`; `pggb_gfa_to_bed.py` writes it into the BED as `SM:Z:`, and the GFA
parser reads it into `GraphNode.samples`.

rGFA's `SR` rank is a different thing. It records the construction generation at
which minigraph added a segment, so it can say "first seen in the Nth assembly
processed" and nothing about which other assemblies have the segment. The bovine
README writes "never carriage" about its `firstSeenIn` column for that reason.

Whether a graph can give the per-node list depends on whether it records
haplotype paths:

- **human: yes.** The minigraph-cactus graph has 464 haplotype walks, which
  `gfa-to-tabix --walks` indexes on GRCh38 as
  `demos/hprc/hprc-v2.1-mc-grch38-f5s.GRCh38.walks.bed.gz` (1,550,816,162 bytes,
  walk format 5 with skip rows).
- **bovine: yes, in the callset only.** The Zenodo source GFA has 12 P lines per
  chromosome (`Zenodo/minigraph/10.gfa`: 1 H, 15,349 S, 21,854 L, 12 P), on disk
  under `/mnt/sdb/cdiesh/bovinePangenome/Zenodo/minigraph/`. The BEDs went
  through the reconstructed rGFA and `gfatools gfa2bed`, which drops `SM:Z:`, so
  their `firstSeenIn`/`discoveryRank` is P-line order. `vg deconstruct` over the
  same GFAs gives the callset its per-breed genotypes.
- **mouse: no, because the graph has no paths.** A line-type census of the 3.3
  GB `mouse-mm39-minigraph.rgfa` finds `H`, `S` and `L` lines only, with zero P
  or W lines. `minigraph -cxggs` emits no haplotype paths, so `firstSeenIn` is
  construction order. `~/mousePangenome/createMousePangenome.sh`
  (cactus-pangenome over the same 19 assemblies, which emits paths) never ran:
  its `cactus.log` is 148 bytes from 2026-03-21.
- **Arabidopsis: no**, for mouse's reason. Its sidecar recovers carriage per
  bubble by mapping each accession back onto the graph (below).

## SV resolution is the target, not base level

The four graphs serve the graph route at the same resolution, SV level, from a
minigraph rGFA. The HPRC tutorial reads `sv.gfa` (`*.sv.gfa.gz`, 842 MB) and
deliberately skips the base-level `*.gfa.gz` (63 GB): "the `sv.gfa` is the graph
route; the VCF is the variant route." The sizes agree. The projections take
about 9.6 bytes a segment (bovine 425,796 segments → 4.07 MB; mouse 1,321,274 →
12.3 MB), so human's 6.69 MB `segs.bed.gz` holds on the order of 700,000
segments, where a base-level 464-haplotype graph has several hundred times that.
`SV_FILTER` in `pangenomeLinks.ts` (`alleleLength(feature)>=50`) shows only the
structural tier anyway.

A base-level bovine graph would come from `Zenodo/cactus` or `Zenodo/pggb` (29
files each, 26.1 GB and 23.7 GB, never extracted). It would make cattle more
detailed than the HPRC reference implementation, on a route that implementation
declined.

## Which routes each graph serves

|             | graph route              | variant route                               | walk route                             |
| ----------- | ------------------------ | ------------------------------------------- | -------------------------------------- |
| human       | v2.1 `sv.gfa`            | HPRC `wave`, split and filtered here        | the walk file                          |
| bovine      | Leonard et al. minigraph | `vg deconstruct`, run here                  | none; nobody publishes one             |
| mouse       | built here               | none: needs `minigraph --call` per assembly | none: needs a minigraph-cactus rebuild |
| arabidopsis | built here               | `minigraph --call`, run here, unpublished   | none                                   |

**The bovine callset** came from `vg convert -g <chr>.gfa -p` and
`vg deconstruct -p HER -a` per chromosome. On `25.gfa` (43.9 MB) the two took
1.6 s and 0.42 s and gave 2,593 records with `AF` and a GT column per assembly
(`ANG BIS BRA BSW GAU HIG NEL OBV PIE SIM YAK`); the whole corpus extrapolates
to about two minutes. `deconstruct` names CHROM after the path it was given, so
rename the P line to the PanSN form first (the mapping `gfa_paths_to_rgfa.py`
applies), and one rule then names both files' sequences. Its genotypes are
haploid, so `graphVcf.phased` is unset there.

**The map's sidecar needs a per-haplotype callset**, so HPRC and cattle have one
and mouse does not. The mouse and Arabidopsis graphs record no paths, so their
callset comes from mapping each assembly back onto the graph with
`minigraph -cxasm --call`, as jbrowse-components'
`scripts/build_minigraph_paths.sh` runs it.

- **Arabidopsis has one.** `buildArabidopsisSvStates.sh` calls the 27 assemblies
  in `~/1001g/graph/` (about 135 Mb each, 4 minutes each at 8 threads, 6 GB
  peak) against `1001g.rgfa`, merges them with minigraph's `mgutils.js merge`
  and `mgutils-es6.js merge2vcf -r0`, and packs the VCF in the cattle path's row
  format. Its intermediates stay in `/mnt/sdb/cdiesh/arabidopsisSvStates/`
  (`calls/*.call.bed`, `arabidopsis-tair10-minigraph.vcf.gz`); the VCF is not
  published.
- **`merge2vcf` writes a header that bcftools cannot sort**: `END` and `AN` go
  undeclared, so htslib reads `END` as a string. The build declares both in the
  `##` lines it hands the merge, which `merge2vcf` passes through.
- **mouse has not run.** The inputs are the per-chromosome graphs in
  `/mnt/sdb/cdiesh/mousePangenome/graph/` and 18 strain assemblies of about 2.7
  Gb in `fasta/` beside it (30 GB). Scaled by genome size from Arabidopsis's 80
  minutes, the calls would take about a day.

## The walk route

The Haplotypes launch (`hprc_v2_1_walk_lanes`, `WalkTabixSyntenyAdapter`) has
read the walk file since 9b7c06e, at 5 requests a window where a gbz-base track
took 23 to 57, and the focused row's graph has cut it since 2026-10-19. The
config's gbz-base track went the same day. gfa-to-tabix's
`docs/gbz-comparison.md` compares the two formats on HPRC v2.1.

## Which haplotypes a window opens on

`structuralForms` (`pangenomeSvStates.ts`) groups a window's haplotypes by their
states in the sidecar, and `structuralPanel` (`pangenomePanels.ts`) keeps one
per form, commonest first: every form where there are at most
`COMPLETE_PANEL_SIZE` (10), and the commonest `PANEL_SIZE` (8) otherwise.

**The view's height sets those numbers; load time does not**, measured
2026-09-17 on ada. Warm AMY1 launches settle in about 5.0 s at 8 and 9 lanes,
5.2 s at 12 and 5.2 to 5.5 s at 16. Each lane adds about 53 px. Eight lanes and
the reference end 760 px down a 1440×900 window, and ten end at 865 px, inside a
1080p window.

**The sidecar does not filter on `LV=0`**, because `LV=0` does not mark the top
level in the release's callset. vcfbub removed every snarl with an allele over
100 kb and kept its children, so at `hp` all 448 LV=1 records hang off a snarl
with no record. They include a 1,716 bp deletion in 190 of 461 haplotypes, while
the one LV=0 record is a 302 bp deletion in 5. The old per-locus panels, which
filtered on `LV=0`, gave 15 of the 20 curated loci a panel. The genome-wide
sidecar gives 19, and rhd, smn, defb and ugt2b17 each gain a panel on the
deletion the filter hid. srgap2's window holds no structural record at all.

**Any member of a form can stand for it**, since every member draws the same
structure, so the panel picks the alphabetically first whose lane would draw
gene models. Only HG002's two haplotypes lack an annotation, which is why
`haplotypesWithoutGenes` is declared on the dataset instead of derived.

## The sidecar's no call is two states

Format `v2` of the sidecar (`buildHprcSvStates.sh`, 2026-10-08) separates `_`, a
no call under a snarl that calls the haplotype, from `.`, a haplotype no snarl
above calls. Format v1 wrote `.` alike for a deletion spanning the site, a route
through a removed parent and a haplotype the graph does not place.

The removed parent is the record that tells these cases apart. Of the 426 snarls
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
| UGT2B17, form of 229, chr4:68,530,001-68,680,000 | deletion, 117,313 bp         | All 229 have a -117 kb allele at the 117 kb parent.                                                                                                                         |

Three other sources give a worse answer than the raw callset:

- **The haplotype walks** (`….walks.bed.gz`) give placement exactly and the
  wrong answer for a deletion. At AMY1, 247 of the 255 step over 94 kb of
  reference, yet only 52 are 94 kb shorter, because the other copies sit on
  non-reference nodes.
- **The MAF summary** (`….summary.bed.gz`, 1.7 MB) reproduces defb's 210 / 181 /
  4 split in a 9 to 37 KB read, and cannot tell a deletion from a clipped
  stretch.
- **The wave and pgbi callsets** hold nothing the sidecar lacks: no `*` allele,
  no parent.

The build ran on ada:

- **It read 426 removed snarls and restored 422.** The kept rows name 425
  parents, and those name 1 more; 4 fall under `MIN_CARRIERS` called haplotypes.
  Each read is one `bcftools query` over the span of the parent's children, 4 at
  a time, and the first 416 took about 13 minutes, which the script caches as
  allele lengths. vcfwave moves a record, so a read at the first child's
  position alone missed 10 of the 425.
- **581,424 of 8,169,115 no-call states are `_`** (7.1%), over 16,671 rows. The
  file went from 388,147 rows and 18,520,683 bytes to 388,569 and 18,594,890.
- **A restored row's state is a residual.** With the parent's whole size change
  as its state, HP's 184 read "1.7 kb deletion, 1.7 kb deletion" and pga's 105
  "19 kb insertion, 19 kb insertion", once at the child and once at the parent.
- **The 1 kb floor (`RESTORED_STRUCTURAL_BP`) holds genome-wide.** The median
  restored row has 448 of 462 haplotypes at the reference's structure, and 248
  of 422 have no size that 5 haplotypes share. 43 rows have 10 or more such
  sizes (39 at chr1:16,537,879), loci where size is a continuum; SMN's 1.6 Mb
  parent is one, with 23.

**The residual assumes that the rows under a parent sum to its allele, and the
build cache confirms it where the cache can tell.** The counts below cover the
422 restored parents and count a haplotype only where every row under the parent
calls it: 143,288 haplotype-parent pairs. The other 26,510 pairs take another
route, which is the case the residual exists for.

- 132,473 pairs (92.5%) leave a residual under 1 kb, so the parent's row reads
  as the reference's structure; 209 of the 395 parents with such pairs have no
  other kind.
- Of the 37,096 pairs whose rows sum to 1 kb or more, the parent is within 1 kb
  of the sum at 30,975. At 189 the parent is under 1 kb itself, the one case
  that shows the rows do not sum, and its row then shows a size the haplotype
  does not have. 134 of those are at two nested parents on
  chr8:6,978,932-7,017,149, in the 8p23.1 defensin cluster, and 27 at
  chr11:89,829,976-90,036,616.
- The other 5,932 have a parent and rows that are both large and differ. The
  rows are structural records only, so a route that differs at no such row looks
  the same as rows that fail to sum, and the cache cannot tell which.

A haplotype counts as not placed only when it has no call at any row of the
window. The alternative, dropping the form whose key is `.` at every informative
site, took AMY1's 12, which are missing at the 176 kb parent and called at other
rows; they form a separate form, "not aligned at 65 sites". Five of the 22
examples had such haplotypes: defb 390, flna 116, smn 96, nphp1 5 and hba 2.

The table lists what v2 changed at the 22 examples. The 12 not listed (c4, hp,
cyp2d6, hba, srgap2, mns, cfhr, prss, gstm1, gstt1, pga, flna) kept their lanes.

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

SMN is the one example v2 makes busier. Its three sites sit in a 1.6 Mb snarl
that 283 haplotypes cross on other routes and 157 are not called at, with routes
of over 60 sizes. v1's "379 skips 3 sites" put those 283 and the 96 the graph
does not place under one lane. A restored row wider than the window still
counts, because a deletion spanning a small window is exactly that case.

## Per-haplotype gene models

HPRC's release 2 CAT annotation has to be rehosted: each file on S3 is plain
gzip in gene order, so no index can be built over it where it is. Rehosted as
CAT publishes it, one haplotype is 129 MB bgzipped, 59 GB for all 462, and
nearly all of that is not gene models. CAT keeps ~5 transcripts per gene and
repeats a ~30-field attribute block on every exon and CDS row, 3.3 million of
them. Measured on HG00097#1 on 2026-09-17, the same transcripts as BED12 are 14
MB, one transcript per gene 3.4 MB, and one per protein-coding gene 1.5 MB;
bigBed came out larger than bgzipped BED at every size. A lane draws one model
per gene, so `buildHprcGenes.sh` publishes the 3.4 MB form for every haplotype,
~1.6 GB in all. Projecting hg38's genes through each lane's alignment would need
no hosting, but it is viewer work and would miss the genes a haplotype has that
the reference lacks.

The lanes drew wrong genes at the portal's GSTM1 example until 2026-10-16,
because the reduction kept CAT's choices. It now applies rules of its own
(`website/src/components/pangenomeGeneModels.ts`), reading GENCODE v48, the
release CAT projected (all 378,248 source transcripts in HG00097#1 match v48 at
their version):

- **The model is the Ensembl canonical transcript's projection.** CAT carries no
  canonical tag, and the old rule, the longest coding sequence, picked
  GSTM2-204, which liftoff stretched to 23 kb.
- **A gene with no symbol is dropped**: 38,928 of HG00097#1's 82,851 genes,
  mostly lncRNA named by an ENSG id. A lane keeps ~44,000 genes, ~2 MB.
- **Two coding genes stacked on the same coding exons**, whose source
  transcripts lie apart on GRCh38, keep the gene the graph places there. The
  converter cuts `hprc-v2.1-mc-grch38-f5s.GRCh38.walks.bed.gz` over each stacked
  gene's GRCh38 span and keeps the gene whose span the haplotype's walk crosses
  at the model. A haplotype has 6 to 13 such stacks, mostly IG segments, OR4F,
  GAGE, POTE and HLA-DRB.
  - The converter and `generatePangenomeLocusGenes.ts` read every abridged walk
    in full (`expand`). Unexpanded, the HLA-DRB locus cut split 519 walks at
    their summary rows and ran their windows past where they rejoin GRCh38
  - CAT labels such a projection `ortholog`, with no paralog or poor-alignment
    class, and its alignment goodness (the GFF3 score column) reads 100 or 1,000
    wherever CAT did not align the projection itself, so no threshold on it
    picks the right gene at both known stacks.
  - In HG00097#1, which lacks GSTM1, CAT put GSTM1 on GSTM2's exons at 93.4%
    beside GSTM2 at 100, and GSTM2 has to stay.
  - On 113 haplotypes' DRB1, CAT put DRB5 at 100 beside DRB1 at 91.6-92.7%, and
    DRB1 has to stay. The graph puts GRCh38's DRB1 onto the real DRB1 in all
    113, so all 462 DRB1 copies read DRB1, where 349 did before. The truth for
    that count is the best-aligned of GENCODE's 13 DRB transcripts across
    GRCh38's eight MHC haplotypes.
  - In the 2026-10-17 rebuild the rule renamed 1,427 stacked models outside DRB
    and GSTM, and no locus lost its model. The graph's name matched the contig's
    chromosome in all 327 renames that moved a gene between chromosomes on a
    placed contig (215 of them OR4F5 to OR4F17 on chr19), and matched the IGK
    cluster the copy sits in, judged by distance from IGKC, in 463 of 465.
  - Goodness decides where the graph places both or neither, or holds no walk of
    the haplotype (HG00272's two).
- **A gene GRCh38's primary assembly lacks gets a model from a row in
  `pangenomeLocusGenes.ts`.** CAT projects only GENCODE's primary annotation, so
  GSTT1 and LILRA3, which GENCODE annotates on alt contigs, had no model on any
  haplotype.
  - `generatePangenomeLocusGenes.ts` cuts the walk file over a GRCh38 window
    over the stretch that holds the gene, reads each haplotype's stretch of the
    walk from its HPRC assembly, and splices the alt-contig transcript onto it
    with minimap2. The model replaces any CAT model of the family it overlaps.
  - GSTT1 gets a model in 213 of the 460 annotated haplotypes in the graph and
    LILRA3 in 359, the same haplotypes whose walk holds the 54 kb insertion at
    chr22:24,001,842 and the 6.7 kb one at chr19:54,297,005, at a median 99.90%
    and 99.94% identity over the transcript.
  - HLA-DRB3 and HLA-DRB4 are alt-only too. The `hla-drb` row takes the walk
    across the stretch between DRB9 and DRB1, where a DR haplotype keeps its
    second expressed DRB gene, and names each copy by the best-aligned of
    GENCODE's 13 coding DRB transcripts: 188 DRB3, 127 DRB4 and 75 DRB5, one in
    each of 390 of 462 haplotypes, none named DRB1. Before it a DRB3 copy read
    DRB5 (189 of 189) and a DRB4 copy DRB5 (97 of 126) or DRB1 (29).
  - Checked against 1000 Genomes' HLA types, whose DRB1 groups imply the second
    gene (DR51 DRB5, DR52 DRB3, DR53 DRB4, DR1 and DR8 none): 102 of the 103
    typed samples carry exactly the copies their two DRB1 types imply. HG03139
    (DRB1\*08:04, \*15:03) has no DRB5 model, which its \*15:03 implies.
  - Six KIR genes are alt-only and still need a row, which would list every KIR
    gene as a candidate, since the best-aligned candidate names each copy.

Checked on 2026-10-16 by mapping each GRCh38 gene to the haplotype with minimap2
and comparing with the models: GSTM1 (HG00128#1, HG01243#1 present; HG00097#1,
HG00099#1 null), UGT2B17 (5 of 9 haplotypes deleted, each with no model), the
CFHR3–CFHR1 deletion in HG00253#2, and AMY1 copy number (2 to 5 copies, one
model each in 5 of 6 haplotypes). HG01346#1's second GSTM1 is a "GSTM2" novel
isoform with no model, and one of HG00253#2's three AMY1 copies is two AMY1A
fragments.

Every haplotype has an assembly, because a lane can be any haplotype. The
assemblies' `chrom.sizes` come from the `.fai` HPRC publishes beside each
bgzipped FASTA, whose contigs are PanSN-prefixed (`HG00126#1#CM090108.1`) where
the graph and the annotation name them bare. The FASTA therefore cannot serve as
an assembly's sequence without an alias file per haplotype.

## Nothing reaches the bucket without a committed script and a README

This rule is an invariant. The mouse and bovine data were served from 2026-09-02
while the only record of how they were made was shell scripts on one build box
under `/mnt/sdb`, outside git, until jbrowse-components d89f7c3025 committed the
builders.

For any step that processes raw data:

- **The build script is committed before the data is uploaded**, in
  jbrowse-components `scripts/` beside `build_rgfa_tabix.sh`. HOSTING.md's "Demo
  assets drift from their build scripts" section is the standing warning.
- **A `README.txt` ships beside the data in the bucket**, with the source and
  its checksums, what was modified and why, the tool versions, the exact
  commands, the audits run and their results, and the caveats a reader would
  otherwise misread. `demos/{mouse,bovine}_pangenome/README.txt` are the model:
  the bovine one's "Rank above 0 is a CONVENTION, not a measurement" paragraph
  states something the data cannot show, and leaving it out would be wrong.
- **The run's log is kept** beside the outputs (`cactus.log`, `build.log`,
  `rgfa_build.err`, `upload.log`), so wall times and failures are recoverable.
- **An audit that could fail without an error is asserted in the build script.**
  The mouse build exits non-zero on an unexpected `SN` tag or a duplicate
  segment id, and the bovine build checked its reconstructed coordinates by
  summing the HER path against bosTau9's chromosome lengths, 29 for 29.

## Coverage facts

These are properties of the data that no convention changes. The tutorials
record them, and the pages have no caveat prose.

- **Mouse has no chrY.** No strain assembly in the panel has a Y sequence, so
  chrY is a bare reference thread (one segment, zero links). chrX has 18 of 19
  strains: C57BL_6J_T2T's chromAlias names 238 sequences and none is an X or a
  Y. The tier index holds 20 sequences, chr1–chr19 and chrX.
- **Bovine is 29 autosomes only**; the Zenodo sets cover no sex chromosome.
- **Bovine rank is a convention.** Ranks 1..11 are P-line order, so
  `discoveryRank` and `firstSeenIn` are weaker than the usual minigraph caveat.
- **22 of bovine's 153,719 bubbles** sit at `gfatools`' clamp of 2147483647,
  which means "more paths than I can count", not a measurement.
- **A gene track is per dataset** (`geneTrackId`): bosTau9 publishes no
  `ncbiRefSeqSelect`.
- **CloudFront matches an invalidation wildcard only as the last character**,
  which is why `upload.sh` invalidates `/pangenome/*`.
