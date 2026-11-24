---
name: conserved-gene-order-review
description:
  Review of /conserved-gene-order on 2026-11-21, two passes plus three
  subagent reviews. D, A, B and C are on main; the rest alters what the page
  shows, so show renders first.
---

# /conserved-gene-order review, state on 2026-11-21

**Shipped 2026-11-21 (Colin: "do whatever you think is best"):** picks D and A,
correctness only, as `bcc6b378f04e` on main. The Lambda is deployed with cache
prefix `neighborhood/v6` (verified live: HBB 11 genes, MISS then HIT, NCBI key
kept). The website deploy (`./run.sh --upload-only` on ada) waits for another
project's `run.sh` on ada to finish; check `git log` on the deployed site or
rerun it if this note is still here.

**B and C landed 2026-11-21 on Colin's pick ("land as shown")** as
`944888844cba` on main. Not yet deployed: the website deploy waits for the
other `run.sh` scripts on ada (walks8 drawcheck gate, a jbrowse-components test
runner), and ada's main holds an unpushed "Plain links" homepage commit
(`9e45f56666cd`) that run.sh would push and deploy with it. The worktree
`/home/cdiesh/src/jb2hubs-wt/gene-order-figure` and ada's `~/wt/gene-order-figure`
can go.

**Still open, all of them changes to what the page looks like, so they wait for
Colin's pick:** the window that widens by
itself (it replaces the "Search window" control, so it goes with C), a visible
mark for genes hidden on another scaffold or cut as distant, orienting rows
against their neighbours. Smaller leftovers: 144 tab stops, RefSeq accessions
in tooltips, the "pygmy chimpanzee" label, the 2026-10-08 blog post's link to
`/gene`, and the section-6 code cleanups.

**The review page is https://claude.ai/artifact/QzXzHeYZsoCxKj4BYJ1SgD**
(published 2026-11-21 with all three reviews merged; the first-pass artifact
XiL8BLtAeo45jaTrU8a38m could no longer be read). Its source is `body.html` +
`style.css` in the second session's scratchpad
`/tmp/claude-1001/-home-cdiesh-src-jb2hubs/41095580-5bd8-414f-bae5-861a03d7552a/scratchpad/`,
filled from `figs2.json` and `figs3.json` (NF1 renders, `render3.mts`) in the
first scratchpad. Colin has not picked yet.

**Mirror-vote fix, measured 2026-11-21** (`layoutTie3.ts`, `adj.mts` in the
first scratchpad): keep `layoutTie2`'s placement (end-descending, containment
keeps reference order) and drop nested pairs from `isInverted`'s vote. NF1
default crossings 85 → 27, all species 2308 → 378; HOXA9/13, TP53, BRCA1, HBB,
Antp unchanged or better. The figure reviewer's midpoint order takes NF1 to 10
but HOXA9 from 1 to 364 out-of-order rows; an adjacent-pairs-only vote doubles
TP53's full-set crossings. Both rejected.

## Verified bugs, most serious first

- **The assembler reads only the first 20 candidate neighbours.**
  `fetchGeneReports` (`website/src/components/neighborhood.ts`, the
  `dataset_report` call) sends no `page_size`, Datasets defaults to 20 and
  `next_page_token` is ignored, and the 20 are in esearch relevance order.
  Checked against NCBI: HBB's window has 41 candidates and 11 protein-coding
  neighbours; production draws 6. TNF and fly dpp are wrong too (3 of 14 loci
  at default settings). With the page size raised, HBB gets 11 anchors and 121
  eligible species instead of 25 (`assemble.mts` runs the repo's assembler with
  that one change; output `nb/HBB_full.json`). Fix needs a Lambda deploy and a
  cache prefix bump to `neighborhood/v6`.
- **A mirrored row sorts by start descending**, so a gene nested in another
  swaps with it and draws a false rearrangement (`placeOrdinal`,
  `multiSyntenyLayout.ts`). HOXA9: 150 of 888 rows out of the reference's
  order, 1 after the fix; HOXA13 152 of 883, then 2; 3 of the 15 default rows
  in both. The fix is two parts that must ship together: sort a mirrored row by
  `end` descending, and keep the reference's order for a pair where one gene's
  span contains the other.
- **A reference gene on an unplaced scaffold gets the query alone.** The
  position search sends Datasets' `sequence_name` ("Unplaced Scaffold") as the
  chromosome. Chinese hamster Tp53 returns 1 anchor. About 24% of species in
  TP53's set sit on such sequences, so this hits any of them used as reference.
- **A search that finds nothing is cached as a normal one-gene answer**, and
  the response carries no candidate count, so the page cannot tell a gene
  desert (MYC) from a failed search. MYC shows "No informative ortholog
  neighborhoods found."
- **Readthrough loci take anchor columns**: PTGES3L-AARSD1 (BRCA1, an ortholog
  in 1 of 892 species), TNFSF12-TNFSF13 (TP53 at 21 genes).
- **Keyboard focus never traces a gene.** `traceHover` looks up from the
  focused `<a>` for `data-anchor`, which is on the `<path>` inside it. The
  figure is also 144 tab stops (650 expanded).
- **"Genes" overstates.** The select reads 11 or 21 while fewer are drawn
  (TP53 at 21 draws 17; partly the 20-candidate bug).
- **Anchor order has two sources.** `anchors[].refStart` is NCBI's full span;
  the reference row draws coding extents for outliers. Legend order and its
  tooltip disagree with the row (SHBG/SAT2, OR51B5 165 kb vs 939 bp), and
  nearest-neighbour ranking uses the raw span.
- **Cached answers carry no build date** and already differ from live NCBI on
  12 of about 666 TP53 species (6 on superseded assemblies) inside 37 days.
- **Smaller**: long species labels overrun the tree; the legend reflows on
  hover (bold); the row tooltip says "locus inverted" for a row that is only
  stored on the other strand; `sample` in `neighborhoodTrim.ts` takes model
  organisms in tree order, not rank order (a zebrafish reference shows no human
  or mouse); "Show 80 species" is not in the URL; the page mixes "neighbours"
  and "neighbors"; tooltips name sequences by RefSeq accession; the 2026-10-08
  blog post still links the figure to `/gene`.

## From the figure-code review (verified by running the layout)

- **`isInverted` ranks by `start` too**, so nested genes skew the mirror
  decision. NF1: elephant and cattle are left unmirrored though they mirror
  baboon and mouse exactly, giving 85 crossings in the default figure where 10
  are real (ADAP2/RNF135). A wrongly unmirrored row also opens its pairwise
  JBrowse view un-reversed (all 7 cattle NF1 clicks). Use one mirror-symmetric
  order for `placeOrdinal`, `isInverted` and `refRank`.
- **A merged GeneID makes the query an anchor twice** (`neighborhood.ts`, the
  `id !== queryGeneId` filter runs before Datasets resolves 646021 to NF1).
  Two outlined NF1 arrows in every row, NF1 twice in the legend, duplicate
  React keys, the query off its column in 14 of 15 rows. De-duplicate by the
  resolved GeneID.
- **Genes on another scaffold or cut as "distant" vanish with no mark**; only
  the species label's hover title says so. Fly Antp hides 60 genes in 12 of
  its 15 default rows, NF1 10 in 5, TP53 7 in 2.
- **The "distant" cut is inconsistent.** A row with 3 or fewer genes is never
  cut below 10 Mb, so ordinal mode draws genes megabases apart as adjacent
  (Japanese jack mackerel TP53: 7 genes over 15 Mb) while frog is cut at
  1.05 Mb.
- **Rows are oriented against the reference, not their neighbours**, so two
  rows with the same arrangement can be drawn as mirror images (expanded
  figure only: BRCA1 1 boundary, Trp53 4).
- **The default 15 rows never reach the outer clades.** Human has 19 kinship
  rings for 14 rows: TP53's default leaves out all 306 ray-finned fishes. The
  button's tooltip says "a sample of every clade further out", and nothing
  says 80 of 779 after expanding.
- **In a mirrored row every arrow points opposite to the strand its tooltip
  gives**, and the tooltip does not mention the mirroring.
- **bp mode**: the 3 px minimum width pushes a shrunk row's last gene up to
  3 px into the span label (3 of 80 TP53 rows).
- Checked and correct: the tree drawing, ribbons, bp placement, the query
  column, every gene click's target and `[rev]` flag, the star link's window.

## First-pass claims to retract in the artifact

- "HBB's NCBI ortholog calls are too sparse, drop it from the examples." Wrong
  cause: it was the 20-candidate bug. Chimp, gorilla and mouse still have no
  HBB ortholog call, so the note about what a gap means still stands.
- "Keep the reference's order for overlapping genes." Too broad: a one-base
  overlap hid real inversions (MAPT/KANSL1 in seven birds and reptiles, a fin
  whale TP53 block). Containment only.
- "Rows must draw two genes." Too strict: it dropped chicken and zebrafish.
  Drop a row only when it draws fewer than two genes and lacks the query.

## The proposal as it stands after the red-team

Prototypes: `layoutTie2.ts` (fixes only) and `layoutProposed2.ts` (reference
columns), built from the repo file by `patch2.py`.

- Reference row first, tree rotated so relatives follow nearest first. Rotate
  the tree and the rows together, and sort the reference first explicitly.
- Each gene in its reference column by a DP over increasing slots, with the
  query gene weighted so it stays in one column (commit `c74759cc4200` records
  that decision). Guard a row with more genes than slots.
- Column headers in ordinal mode only, with headroom for long symbols; keep
  the legend in bp mode. Headers were rejected on 2026-10-15 (`2f44fc25d8f1`)
  and still sit over the wrong gene in rearranged rows, so say so to Colin.
- Page trim: caption line in place of the options box, hint, legend and link
  line; drop "Search window"; a reading note naming NCBI as the source.

## Next steps

- Get Colin's pick from the review page: D assembler (first), A fixes,
  B figure, C page. Commit nothing that changes what the page shows before he
  picks.
- One side effect: a reviewer's direct API call cached a malformed answer
  under `neighborhood/v5/10090/7157.f150000.a11.json` (human TP53 asked with a
  mouse ref). The page never requests that key; the v6 bump clears it.
- Code cleanups with no visual change are listed in section 6 of the review page.
