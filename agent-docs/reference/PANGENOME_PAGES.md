---
name: pangenome-pages
description:
  'How the /pangenomes pages, the graph config in the bucket, the lane-width
  rule and the haplotype panels work, and what was removed from them.'
---

# The pangenome pages

The rules are in the repo `CLAUDE.md`. The data side (routes, how many
haplotypes have each segment, the sidecar's measurements) is in
`agent-docs/reference/PANGENOME_PORTAL.md`, and open work is in
`agent-docs/ideas/collections/pangenome-followups.md`.

## The pangenome graph config is ours, and it is stored in the bucket

`website/pangenome-config/hprc-grch38.json` is the config every HPRC graph
launch opens (`graphBrowser.configUrl` in
`website/src/components/pangenomeDataset.ts`), and its three siblings serve the
other graphs. `upload.sh` beside them publishes each to
`s3://jbrowse.org/pangenome/<name>/config.json` with an `upload_if_changed`
stamp. jbrowse-web fetches `?config=` from the visitor's browser, and only the
bucket sends CORS headers; genomes.jbrowse.org sends none. **Run
`website/pangenome-config/upload.sh` before deploying a change that touches
one**, because a launch naming a config the bucket lacks fails to fetch. The
data stays under `jbrowse.org/demos/`, built in jbrowse-components. ADR
`agent-docs/architecture-decision-records/0006-pangenome-configs-stay-in-this-repo.md`
records why the configs are kept in this repo.

The plugin url is the plugin store's `latest/` entry point
(`jbrowse.org/plugins/jbrowse-plugin-graphgenomeviewer/latest/…esm.js`), where
jbrowse-plugin-list rehosts the release its `GraphGenomeView` entry pins. The
plugin links an unreleased `@jbrowse/render-core`, so a pinned release stops
booting as `main` moves, and keeping it booting means bumping that pin. The
plugin shows an error page on every released host (`createSvgIcon`, measured
2026-08-26 on `latest` = v4.3.0). Every launch on the site targets `main`, where
the plugin boots, so `JBROWSE_BASE` cannot point at a release the plugin fails
on.

`pnpm check-pangenome-launches` boots every launch of every dataset on `main`,
including one whole-chromosome tier launch each (the shortest chromosome), and
reads back which tier the graph track cut. Run it after touching `pangenome*` or
a config, with `--dataset` to narrow it. The JBrowse docs' pangenome tutorials
(`website/docs/tutorials/pangenome_hprc.md` and its `pangenome_*` siblings in
jbrowse-components) describe these pages, so a visible change here is owed
there.

### One graph, one route, and almost no prose

`/pangenomes/<id>` (`hprc`, `mouse`, `bovine`, `arabidopsis`) is a page per
graph, rendered by `website/src/pages/pangenomes/[dataset].astro` from the
dataset. `/pangenomes` lists them and has nothing else. A graph's page is one
sentence, a line of links, the **Gene or region** box with the dataset's loci as
a row of examples under it (`PangenomeRegionBox.tsx`, `pangenomeExamples.ts`),
and the file table. The page has no whole-chromosome links: their coarse-tier
plots read as meaningless (2026-10-12).

The box is the page's only client JavaScript, and the page has no style rule of
its own. Its whole design is the site's table rules, the shared query row
(`GeneCombobox` and `.ui-form` from `ui.css`, the controls /gene and
/protein-browser use, so the box suggests a gene symbol as it is typed),
`ui.css`'s lane map (`.ui-lanes`, `.ui-track`, `.ui-mark`), and the browser's
defaults. The 2026-09-16 review found the previous page a wall of prose and
buttons.

The box replaced a loci table (b9b1299) of 22 rows of five launches on HPRC (136
links, 2,629 px) that read as a list of hard regions. A reader names a gene or a
region, or clicks an example, and the answer is that one window: what it opens
as (`regionLaunches` in `pangenomeLinks.ts`, each launch with a line saying what
it draws) and, where the dataset publishes a structural-state sidecar, which
forms the haplotypes have there. The HPRC page is 974 px before a question. The
table had three things the box lacks: the variation class column, the gene hub
link, and launches that work without JavaScript.

**The answer is a map, and JBrowse is one button.** `PangenomeMap.tsx` draws the
window in the /protein-browser's shape:

- **On screen:** a one-line headline (`headline` in `pangenomePanels.ts`), a
  ruler, the window's protein-coding genes (mygene's interval query,
  `genesInWindow`), then one row per structural form with its share of the
  placed haplotypes, and a "rarer forms" row so the shares add up.
- **One button:** "Open in JBrowse" opens the first launch; clicking a row
  focuses its form, and the button then opens that form's representative as a
  haplotype lane.
- **The rest is in "More about this window":** the counting sentence, the forms
  table with counts and an example haplotype, and every launch with what it
  draws.
- **Why:** until 2026-10-14 an iframe of jbrowse-web drew the chosen launch in
  the page. Colin found it overwhelming and asked for a simplified glyph "sort
  of like how protein browser is", with JBrowse only on request. Three reviews
  of the first glyph found it drew losses the data does not support, which the
  rules below fix.

The map draws only what the sidecar supports:

- **One change split over a snarl's records is one change**
  (`mergeSplitEvents`). vcfwave anchors C4's extra 26 kb module at a dozen
  bases, and each anchor's carriers were a form of their own. Only records
  within the change's own size (1 kb at least) of each other merge: CFHR has a
  +330 bp at one base on 112 haplotypes and at another 21 kb away on 2, and one
  span over both drew the first as net (1,311 such cases genome-wide). Merging
  splits a multi-state record into one row per size, so `sites` and
  `nonReferenceMajority` count the records.
- **A deletion and an insertion of one size are a shift, not a loss**
  (`pairShifts`, within 10% and 1 kb or more, no further apart than twice that
  size, and never a net change: one paired with a 1.1 Mb parent's residual drew
  a solid band across the window). 77 GSTM1 haplotypes carry both and keep the
  gene, and C4's module swaps are shifts too. Drawn apart, GSTM1's pairs made
  its null share read 84% instead of 68%.
- **A size change at a site much wider than itself is net** (`diffuse`): SMN's
  restored 1.6 Mb parent has routes 240 kb shorter, which a solid bar over SMN1
  drew as gene loss on 14% of haplotypes. The map draws a pale band over the
  site and says "240 kb shorter in 1.6 Mb".
- **The map draws a deletion its own length centred in its site, then clamps
  it**, since the sidecar records how much a form loses but not which bases. The
  map puts an edge bar on a mark that runs past the window.
- **A site a form is not aligned through, or bypasses, is a dashed gap** in the
  bar over that site alone.
- **A form that only bypasses sites is "another route", not GRCh38's
  structure**: a restored parent calls it with a residual under its floor, so
  the length is the reference's but the path is not. AMY1 has two such forms, of
  171 and 26 haplotypes. The headline's GRCh38 share counts only forms with no
  mark at all, over every form, drawn or not.
- **A form told apart only by changes under 1% has no lane**
  (`structuralPanel`), so the map, the table, the sentence and the launches
  agree; its haplotypes are in the "other forms" row. At SMN that is the
  commonest form, 97 of 366.
- **Shares are of the placed haplotypes.** Hovering a change shows its carriers
  over every form, as a share of the haplotypes aligned at its site, and the
  fold lists the commonest ten. `aligned` is counted over the folded forms,
  since a rare no call folded into a sized majority is a carrier too: counted
  from the raw row, chr3:90,699,772 read 101%. HPRC is a panel chosen for
  diversity, so the page never calls a share a population frequency.
- **Colours are the matrix's `svType` preset**: deletion `#e41a1c`, insertion
  `#800080`, inversion `#ff7f00`.
- **A window with no panel draws no map**: no sidecar (mouse, Arabidopsis), past
  `MAX_DETAIL_WINDOW_BP`, or nothing informative.

**A focused row draws its change as Bandage does** (`PangenomeGraph.tsx`).
Clicking a row cuts the graph around that form's largest placed change, with 2
kb of flank (`changeWindow`), from every haplotype, and draws it with
bandage-core's stress layout: the reference straight, a deletion as an arch, an
allele as a lens, node width by how many haplotypes pass through, the focused
form's haplotype highlighted.

- **The cut reads the walk file** (`walksUrl`, `gfa-to-tabix --walks`), the file
  the Haplotypes launch's lane track reads. `pangenomeWalkCut.ts` cuts it with
  graph-walks' `cutRegion` with `contained: true` (graph-walks 4, walk format
  5), and bandage-core's `loadGraph` builds the graph from its tables. Only HPRC
  publishes a walk file, so only HPRC draws a graph.
- **The tables never become GFA text.** Writing them as GFA and parsing it back
  drew the same SVG, byte for byte, and cost a third of a second at HLA's 7 k
  nodes (19 MB of text) and 2 s at LPA (measured 2026-10-20 on ada).
- **A node limit bounds the cut.** `NODE_LIMIT` (30,000) stops a cut the page
  could not lay out, and graph-walks' byte budget stops the read.
  `WALK_BUDGETS`' 4 M step budget refused LPA's KIV-2 window (4.6 M steps). Past
  either limit the figure reads "This stretch of the graph is too large to
  draw."
- **Not the whole window:** measured 2026-10-14, a whole window holds
  1,300–11,000 nodes, and drawn at 900×140 it is a barcode of SNP bubbles.
  `foldVariants`, which would collapse them, refuses a graph with walks.
- **The figure has 400 px of height room.** A ring or loop (LPA, KIR, FCGR, HP's
  insertions) is about as tall as it is wide, and at 200 px it drew across a
  fifth of the width. bandage-core shrinks the frame to a flat cut's drawing but
  never below 160 px, so a flat cut such as HLA's still draws a thin line in a
  900×194 frame; only a bandage-core option could trim that.
- **One change reads:** GSTM1, C4's HERV and HP's 1.7 kb deletion each draw as
  one clear bubble. A cut past `MAX_GRAPH_BP` (40 kb) draws nothing, and a net
  change has no place to cut, so CFH's 85 kb deletion and SMN's parents have no
  graph.
- **The cut keeps each walk within the window.** A contained cut splits a walk
  where it steps onto the reference outside the window ± 1 kb and draws the rest
  as a gap. AMY1's 4 kb window holds 182 nodes (9,928 uncontained; the gbz-base
  cut the page used before 2026-10-19 held 1,845, because it keeps 1 kb of each
  other copy a haplotype jumps into). KIR's windows hold 4,772–14,448. An
  insertion that leaves the window and comes back stays whole, so GSTT1's 54 kb
  insertion and LPA's 78 kb one draw as loops (2,314 and 22,357 nodes).
- **Timing:** measured 2026-10-19 from node on ada over every example's
  focused-row windows (42), a cold cut takes 0.1–1.4 s, 2.2 s at LPA, and the
  layout takes under 1.4 s except at KIR (3.2 s) and LPA (6.1 s).
- **Where HLA's first click goes**, measured 2026-10-20 from a browser on ada
  against production (2.3–3.6 s to drawn): the walk file's index, header and
  rows load one after another (0.6, 0.2 and 0.8 s), the cut takes about 1 s and
  the layout under 0.7 s. The cut reads two whole 64 kb chunks of 438 haplotypes
  for an 18 kb window, inside graph-walks. Its per-chunk node-limit check
  (`surelyKept`) costs 7–20% of the cut, and the page keeps it, because it stops
  an oversized cut early.
- **The layout runs in a worker** (`pangenomeGraphLayout.worker.ts`), from the
  cut to the SVG's data url. Handing bandage-core a worker-backed `LayoutEngine`
  would leave most of LPA's work on the main thread: loading its graph takes 0.7
  s, the steps around the engine 0.2 s, and the graph and layout it would post
  back clone to hundreds of MB.
- **The worker keeps its cuts per window**, so another row's highlight redraws
  in about 0.13 s. `pangenomeGraphLayout.ts` terminates it when the 30 s
  deadline passes or a row of another window is clicked while it is busy.
- **Main-thread blocking**, measured 2026-10-19 in a dev-server page on ada
  during a `run.sh`, from click to drawn. Before, the page cut without
  `contained` and laid out on the main thread; after, the worker lays out the
  contained cut.

  | Example | Drawn before | Longest task before | Drawn after | Longest task after |
  | ------- | ------------ | ------------------- | ----------- | ------------------ |
  | C4      | 0.4 s        | 284 ms              | 0.5 s       | none               |
  | GSTM1   | 1.0 s        | 844 ms              | 1.1 s       | none               |
  | AMY1    | 4.3 s        | 3,629 ms            | 0.3 s       | none               |
  | KIR     | 3.2 s        | 1,448 ms            | 2.7 s       | none               |
  | LPA     | 5.8 s        | 5,465 ms            | 6.1 s       | 84 ms              |
  | GSTT1   | 1.2 s        | 547 ms              | 0.9 s       | none               |

- **Stress, not FMMM:** FMMM is 434 KB of wasm and draws a tangle at this size.
- **The licence:** bandage-core is GPL-3.0-or-later. `PangenomeGraph.tsx` and
  its layout worker are the only modules that load it: the worker imports it,
  and `PangenomeGraph.tsx` starts the worker on the first click. Each carries an
  SPDX header, the page names the library and the source, and the root `LICENSE`
  says the deployed site is distributed under GPL terms while each file keeps
  its own licence.
- **The walk file sends `Access-Control-Allow-Origin: *`** (checked 2026-10-19).

**The matrix is ordered to match the map.** On HPRC, `regionAnswer` hands the
launches every placed haplotype grouped by structural form, commonest first
(`MatrixRows` in `pangenomeLinks.ts`), and the matrix takes it as `rows.domain`,
so each form is one block of rows, commonest first, as the map draws them. A
phased row is `<sample> HP<n>` from 0, and sidecar `#1` is `HP0`: at CFHR the
sidecar's 138-member deletion form and the VCF's 138 carriers of the 84,685 bp
deletion are the same set in `wave` and `pgbi`, and the other mapping matches
nothing (checked 2026-10-09).

**A haplotype the sidecar calls nowhere in the window draws no row**
(`rows.kept`, set only when there is such a haplotype). On chrX that is each
male's first haplotype. `wave.vcf.gz` writes it as a no call (`.|1`), while
`pgbi.vcf.gz` wrote a male's one X as both alleles (116 samples, no heterozygous
call among 133,632 at FLNA), so his X drew twice there. Those haplotypes have no
lane either, and the page's sentence counts them.

**The matrix reads the release's normalized callset, `wave.vcf.gz`, one allele
per record.** `website/pangenome-config/buildHprcSvCallset.sh` splits it
(`bcftools norm -m -any`), keeps the alleles that change the length by 50 bp or
more or that vcfwave flags as an inversion, drops CHM13, writes vcfwave's `INV`
flag as `SVTYPE=INV`, and publishes the result beside the sidecar. The script
changes nothing else in a record. vcfwave realigns each bubble allele to the
reference, so a deletion spans the bases it removes and an insertion sits at one
base. The display keeps an insertion at that base
(`showInsertionGlyphs: false`), colors cells by its `svType` preset, and draws a
variant lane of marks above the rows, with labels off because a record's ID is
its graph path. `pgbi.vcf.gz`, PanGenie's input, holds whole bubble alleles
instead, so a 6 kb REF against a 40 kb ALT draws an insertion as a block over
reference the haplotype keeps. Measured on wave (2026-10-09):

- **HP's 1.7 kb deletion is there**, in 190 haplotypes, with no top-level
  filter.
- **vcfwave leaves an allele past its realignment length whole.** CFHR's 85 kb
  region has, besides the deletion, a same-length 84,685 bp REF to ALT record in
  129 haplotypes, which draws as a full-width bar.
- **One event can be several ALT alleles**, split by flanking sequence: GSTM1's
  18 kb deletion is alleles of AC 150 and 241 in one record. Under the default
  colors, by allele index, they interleave inside one block; `svType` paints
  both red.
- **`svType` classes a record, not a haplotype's allele**, and the release
  merges every allele starting at a position into one record. C4's 33 kb module
  record held the deletion and the insertion, so all 130 haplotypes with either
  drew "Other / mixed". After the split, each record is one allele, and each
  haplotype's class is that of the allele it has. The FLNA inversion has a class
  only through `SVTYPE=INV`, because the preset reads SVTYPE and ignores
  vcfwave's flag.
- **"(no value)" is the display's name for a record without a class**, not a VCF
  value. Format v1 kept any allele whose REF or ALT reached 50 bp, and 190,441
  of its 1,650,445 records changed the length by less than 50 bp (48,095 not at
  all). Format v2 keeps a length change of 50 bp or more, or an inversion, so
  every record is a deletion, an insertion or an inversion.
- **A window's records are 1.9 to 16 MB** (MHC class II the largest), under the
  20 MB `fetchSizeLimit`. `wave` has a CHM13 column, which sorts below the
  panel.

Cattle keeps its breed rows. Its callset is `vg deconstruct` run here over the
published minigraph graphs, with whole bubble alleles like `pgbi`, and nobody
has normalized it.

Naming 462 rows puts a launch at ~12 KB, and CloudFront answers 414 past about 8
KB, so `specUrl` moves a long url's params into the hash, which jbrowse-web
`main` reads the same way.

On 2026-10-09 these examples read cleanly on the split callset: GSTM1 (its 18 kb
deletion on 68% of haplotypes, one red block), HP (the 1.7 kb deletion), C4A /
C4B (the 6.4 kb deletion at C4B and the 33 kb module deletion as red blocks, the
module's insertion alleles their own rows), CFH / CFHR (the 138 who delete in
red) and FLNA (the inversion, one block). MHC is too dense to read in the
matrix, and KIR draws an almost empty matrix.

- **A curated locus is one window of at most `MAX_DETAIL_WINDOW_BP`**, and a
  test holds every HPRC window to the limit. Two non-human examples are wider on
  purpose, cattle `defb` and Arabidopsis `knob`, and `pangenomeExamples.test.ts`
  lists them by id.
- **`regionAnswer` (`pangenomeAnswer.ts`) computes the whole answer**: the
  window, its title, the forms and the launches. The box renders it and
  `check-pangenome-launches` calls it, so the check boots what the page offers.
- **A haplotype with no call at any site in the window is in no form and gets no
  lane**, on any chromosome, and the answer's sentence counts them ("116
  haplotypes are not aligned at any of them and have no lane").
  `structuralForms` returns them as `unplaced`. On chrX they are the 116 male
  haplotypes without one; at defb they are 390 and at nphp1 5. A deletion
  spanning a whole window does not count as unplaced: it reads `_` under the
  restored parent that sizes it, and keeps its lane.
- **A lane is labelled with its form.** `describeForm` (`pangenomePanels.ts`)
  reads the form's key against each site's size changes in the sidecar: "as the
  reference", "85 kb deletion", "inversion". The label lists up to two size
  changes and counts the rest with the largest named ("39 size changes, largest
  a 19 kb deletion" at MHC class II), because a list of sizes is unreadable. A
  deletion spanning nested sites is a size at its restored parent's row:
  UGT2B17's 229 haplotypes read "120 kb deletion" and RHD's 86 "70 kb deletion".
  "Not aligned at N sites" marks a `.` in a form with calls elsewhere, and "a
  rarer change at N sites" marks a state under `MIN_CARRIERS` at a site where
  most haplotypes have no call. Over the 22 examples on 2026-10-08, 6 lanes say
  "not aligned" (two each at mhc-hla, smn and nphp1) and 2 say "rarer" (smn,
  defb).
- **A lane whose form is a deletion spanning the window draws nothing, which is
  correct.** The graph has no walk for the haplotype there, so the track opens
  no row for it: 4 of SMN's 8 lanes, each a 190 to 250 kb deletion in a 1.6 Mb
  snarl around the 60 kb window. `structuralPanel` marks a form that bypasses
  every site it does not delete and whose deletion is at least the window's
  length (`mayDrawEmpty`), and `check-pangenome-launches` accepts a missing row
  only for those, as a note. A shorter deletion leaves a flank, so the check
  requires a row for UGT2B17's 120 kb in 150 kb, RHD's 70 kb in 85 kb and AMY1's
  94 kb in 150 kb.
- **An example is its locus's window as a locstring**, and the box recognises
  the text to title the answer and to drop the graph launch for a
  `graphCollapsed` locus.
- **Every dataset has the box.** Without a sidecar the box resolves the window
  against `graphBrowser.chromosomes` and offers the launches alone. Gene symbols
  go through mygene.info, whose coordinates matched all four references on
  2026-10-08 (cattle checked on BTNL2, RHOBTB2 and DEFB4A against bosTau9).
- **The url holds the question as `?region=`.** A window past
  `MAX_DETAIL_WINDOW_BP` (150 kb) gets the graph, plus the bubble lanes where
  the dataset has no callset, since a callset has no coarse tier.
- **The repo commits no panel.** `check-pangenome-launches` asks the live
  sidecar for each example's window the way the box does and boots what
  `regionLaunches` returns, so the check opens the urls the page offers. The
  unit tests use a fixed haplotype list.

### One rule decides how wide a window is drawn

`lanes()` in `website/src/components/pangenomeLinks.ts` picks the segment-level
lanes under `MAX_DETAIL_WINDOW_BP` (150 kb) and the coarse bubble tier above it.
A graph launch (`graphRegionUrl`) is one linear view: a compact gene row, the
segments track opened as its `LinearGraphDisplay` at 420 px, the callset's
haplotype matrix where the window can draw it (`drawsCallset`), then those
lanes. The graph comes first because lanes above it put the graph 732 px down a
900 px window, and 1,415 px down under Arabidopsis's SyRI rows.

- **The narrow lane is the bubbles.** The allele inventory, an AlignmentsTrack
  of one row per allele, showed nothing about which haplotypes have an allele
  and confused readers; the matrix shows exactly that. Mouse and Arabidopsis
  have no callset, so their narrow lane is the bubbles alone.
- **The graph picks its tier by zoom**, past the adapter's
  `coarse.aboveBpPerPx`. The segments lane and the graph are one track, and a
  view shows a track once, so a graph launch has no segments lane and no tier
  lane. The graph's handover depends on the view's width: at 1000 px HPRC's
  graph stays fine to ~1 Mb, while a lane switched at 150 kb would already be
  coarse.
- **Every rGFA track in the four configs is a `GraphTrack`**, which opens as the
  graph, its first display, so a lane over one names `LinearBasicDisplay`. The
  plugin defines a GraphTrack's displays, not the config, so
  `pangenomeLinks.test.ts` checks every launch against the displays the plugin
  registers on it.
- **A chromosome is the widest region and takes the coarse branch**, so the
  whole-chromosome launch and the region launch are one builder.
- **A region has no upper bound.** A coarse cut has no bp cap, so the launch
  does not cap a window at the view's `maxRegionBp`.
- **The callset gets no coarse tier**, so `regionLaunches` offers no variants
  launch past `MAX_DETAIL_WINDOW_BP`, and the graph launch includes no matrix
  there. A VCF has no coarse tier, so wiring cannot change this.

### Every dataset's examples are curated

Mouse, cattle and Arabidopsis each offer seven named loci, in
`pangenomeMouseLoci.ts`, `pangenomeBovineLoci.ts` and
`pangenomeArabidopsisLoci.ts`, beside HPRC's 19 in `pangenomeLoci.ts`. A
catalogue derived by ranking each graph's coarse tier by segments per bubble
(9f4a5aa removed it) found real places and labelled them "Gm10439 +10",
"LOC790886" and "AT4G05215 +19". It never found a single-event locus (Nnt, Mx1,
POLLED, RPM1), each one allele in a quiet window with a segment count of 3 to 9.

Each curated window was measured on 2026-10-08 with ranged `tabix` reads of the
dataset's published `.bubbles.bed.gz`, `.alleles.bed.gz` and
`.tier10000.segs.bed.gz`, plus `.vcf.gz` for cattle and `syri_regions.bed.gz`
for Arabidopsis. Gene coordinates came from the UCSC REST API's `ncbiRefSeq`
track (mm39, bosTau9) and mygene.info species 3702 (TAIR10). No bubble crosses a
window's edge, the rule AMY1's comment states for HPRC. Each locus has its
measured sizes as comments, and each file lists the loci measured and declined
at the top.

Three traps when re-measuring a window against the published files:

- **The bubble and tier files name sequences in PanSN** (`mm39#0#chr4`,
  `bosTau9#0#chr6`, `TAIR10#1#Chr4`), and the allele files and the VCF use the
  bare name. A bare-name query against the bubble index returns nothing, which
  looks like a flat graph.
- **`tabix` on a url writes the `.tbi` into the working directory.** Run it from
  a scratch directory.
- **The mouse and Arabidopsis graphs record no per-haplotype membership.** The
  allele file's `firstSeenIn` is the first assembly, in build order, to add the
  node, so it can rule a strain out and never rules one in. Only cattle, through
  the VCF, records which breed has what.

**The descriptions name the locus and claim nothing about strains or breeds.**
Only the KIT claim about which cattle have the allele (Milia et al. 2025, Genome
Res 35:1041) was checked against a source. Verify a citation before a
description says which strain or breed has an allele.

The windows below were measured the same way and are not offered; any of them
can swap in. The columns are the bubble index's rows in the window, allele rows
of 1 kb or more, the largest allele row, and the segments in the largest
coarse-tier bubble (blank where none reaches the tier's 10 kb floor):

| dataset     | id      | window                       | bubbles | ≥1 kb | largest     | top bubble |
| ----------- | ------- | ---------------------------- | ------- | ----- | ----------- | ---------- |
| mouse       | `rd1`   | chr5:108,520,000-108,590,000 | 19      | 1     | 8,647 ins   |            |
| mouse       | `mup20` | chr4:61,860,000-61,990,000   | 4       | 12    | 81,139 del  | 30 seg     |
| mouse       | `raet1` | chr10:21,955,000-22,093,000  | 28      | 13    | 73,095 ins  | 25 seg     |
| mouse       | `h2-ea` | chr17:34,500,500-34,620,000  | 30      | 4     | 7,833 del   |            |
| mouse       | `amy2`  | chr3:113,098,000-113,335,000 | 2       | 18    | 127,314 del | 121 seg    |
| cattle      | `lyz`   | chr5:44,205,000-44,345,000   | 11      | 9     | 69,315 del  | 32 seg     |
| cattle      | `ulbp`  | chr9:84,665,000-84,795,000   | 6       | 4     | 109,893 del | 25 seg     |
| Arabidopsis | `rps5`  | Chr1:4,135,000-4,157,000     | 10      | 5     | 6,065 ins   | 8 seg      |
| Arabidopsis | `maf`   | Chr5:25,970,000-26,010,000   | 7       | 10    | 15,980 ins  | 41 seg     |
| Arabidopsis | `aop`   | Chr4:1,335,000-1,365,000     | 7       | 9     | 22,087 ins  | 46 seg     |
| Arabidopsis | `acd6`  | Chr4:8,280,000-8,313,000     | 13      | 10    | 5,902 ins   | 47 seg     |
| Arabidopsis | `rps4`  | Chr5:18,295,000-18,340,000   | 8       | 9     | 13,774 del  | 73 seg     |

Mouse `amy2` is one 225 kb bubble (113,101,029-113,326,354), so it would be a
third coarse-tier example. Cattle `polled` is the smallest event offered: one
202 bp record in a 60 kb window with three SVs.

### What a launch must show, from the 2026-10-08 audit

An audit opened all 202 links the four pages then offered on `main`, at 1400 by
900, and timed each until its screenshot stopped changing. Medians to drawn were
variants 1.7 s, graph 2.5 s, bubbles 2.5 s, a whole chromosome 3.2 s, haplotype
lanes 4.7 s and BandageJS 5.3 s; the slowest link that drew took 7.0 s. The
problems were in what the links showed, and each finding below is a rule in
`pangenomeLinks.ts` or a flag on a locus:

- **`callsetBlank` on a locus drops its variants launch**, for the example and
  for a typed window that overlaps it, the way `graphCollapsed` drops the graph.
  The matrix was a flat grey block at AMY1, MNS, PRSS, UGT2B17 and NPHP1, whose
  records of 50 bp or more are absent or too small to draw at the window's zoom.
  At SMN the callset had no record at all and the track never left "Loading…";
  after three minutes the browser crashed. A window nobody curated can still
  land on such a hole.
- **SRGAP2, DEFB (8p23.1) and SMN1 / SMN2 are not HPRC examples.** Every launch
  of SRGAP2 and DEFB showed nothing: a 5-node and a 7-node graph, a blank or
  hung matrix, and no panel or one lane. The callset has no record between
  chr8:7,546,668 and 8,096,808. SMN's one launch drew 4 of 8 lanes, the
  commonest labelled "a rarer change at 1 site", over 24 forms.
- **A dropped example stays in `PANGENOME_LOCI` as `unlisted`.** A typed window
  reads `graphCollapsed` and `callsetBlank` off the loci, so deleting a locus
  gives a typed window back the launch that hangs. HPRC offers 19 examples.
- **The BandageJS link names `maxNodes=40000`.** MHC class II (33,010 nodes) and
  KIR (23,021) stopped on BandageJS's "over the 20,000 this page draws by
  default" question, and draw in 14 s and 7 s once past it. LPA is 19,465.
- **A window over 10 Mb opens no gene lane** (`MAX_GENE_LANE_BP`). The lane was
  a "Too many features" banner on 58 of 78 whole-chromosome launches, and the
  graph labels its own genes at that zoom.
- **Arabidopsis's knob offers no graph launch** (`graphCollapsed`). The graph
  has no bubble for the inversion and drew a straight line; the Bubbles launch
  shows the inversion in SyRI's rows. The flag applies to a wide window only
  when the locus covers all of it, so Chr4 still opens as a graph.
- **The variants launch opens two UCSC tracks under the matrix, not four.** The
  insertion and deletion tracks were mostly 1 bp records and their labels, and
  pushed the inversion and duplication tracks off a 900 px window.

Arabidopsis RPP5 (1,207 nodes) and RPP1 (1,130) and cattle DEFB (1,114) draw as
dense knots; the audit left them as they are.

Screenshotting launches in parallel needs one browser per worker, since a
background tab does not paint. A display's `isLoading` shows whether a track is
still fetching.

### Removed from the pangenome pages

The page was 15,286 px rendered, and ~10,000 px of that was a static 232-row
HPRC sample table plus two mouse-strain tables. `/hubs/HPRC` is a searchable
version of the first, and the accession pages cover the other two. All three are
links now, and HPRC renders through `[dataset].astro` like the others.

None of these is worth rebuilding as it was:

- **The per-locus MSA panel** (`generatePangenomeMsa.ts`, `PangenomeMsaSection`,
  `MsaPanel`) reconstructed 465 haplotypes over one 800 bp window per locus. It
  was 8.1 MB of the 8.4 MB committed under `public/pangenome/`, HPRC-only, and
  its first paint on the headline locus was 465 rows of dashes, because the
  window picker ranked by indel-weighted variation and landed inside a `GAA`
  expansion that one haplotype has.
- **The pangene copy-number matrix** (`generatePangenomePangene.ts`,
  `PangeneMatrix`) drew 100 haplotypes from lh3's `human100` graph under charts
  computed over HPRC's 232 samples. It mixed two cohorts at one locus, and only
  the caption said so.
- **`/pangenomes/explorer`**, a card grid of loci with class filters and a
  per-locus dashboard of four bar charts over the callset, with the per-locus
  `*.vcfsummary.json` summaries, the `notes[]` caveats, the per-locus
  `significance` sentences and the PangyPlot fallback (`externalGraphBrowser`).

### A locus's haplotypes are lanes, and the callset picks which

The Haplotypes launch (`haplotypeLanesForRegion`) opens the
`hprc_v2_1_walk_lanes` track (`WalkTabixSyntenyAdapter` over the walk files at
`walksUri`), one lane per haplotype walk, narrowed to the window's panel. The
panel is one haplotype per structural **form** in the window, commonest first:
every form where there are at most 10, and the commonest 8 otherwise. The spec
holds the panel as `rows.kept` and `rows.domain`, so one track in the config
serves every window. The walk files take 5 requests a window where a gbz-base
track took 23 to 57.

**The forms come from a genome-wide sidecar, not from a per-locus read of the
callset**, so the box can answer the same question for a window nobody curated.
`website/pangenome-config/buildHprcSvStates.sh` publishes one tabix-indexed file
of every structural record in the callset, 19 MB for the genome. Each row holds
where the record is, what each state does to the reference's structure, and one
character per haplotype. `structuralForms` (`pangenomeSvStates.ts`) groups a
window's haplotypes out of a ranged read of it, a few KB and about 300 ms. The
box on the page (`PangenomeRegionBox.tsx`) runs it and `structuralPanel`
(`pangenomePanels.ts`) in the reader's browser for an example, a locstring or a
gene symbol, over a window of up to 150 kb, and `check-pangenome-launches` runs
the same two functions over each example before booting it. An example and the
same window typed in the box therefore get the same answer, because both go
through the same two functions. `agent-docs/reference/PANGENOME_PORTAL.md`
records why the panel uses 10 and 8, why it skips the callset's `LV=0` records,
and the measurements behind each sidecar rule.

The sidecar's rows since format `v2`:

- **The removed parents are rows.** The build reads each from the release's 24
  GB `raw.vcf.gz` by a ranged query over its children and keeps its allele
  lengths: 426 snarls, 422 rows. A parent called in fewer than `MIN_CARRIERS`
  haplotypes gets no row, which drops defb's 5.2 Mb one.
- **A restored row states what its children do not.** Its allele sums every
  child's, so each haplotype's size change has the changes at the rows directly
  under it taken out, and what remains under 1 kb (`RESTORED_STRUCTURAL_BP`) is
  the reference's structure.
- **`_` is a no call under a snarl that calls the haplotype, `.` one that no
  snarl above calls.** `_` has no size of its own; the parent's row has it.
- **A rare state folds into its site's majority, except a call into a no-call
  majority**, which stays apart as `~` and reads "a rarer change".
- **The object name includes the format** (`…sv-states.v2.tsv.gz`), and the
  build copies to the bucket and never syncs, so the file deployed pages read
  stays. Bump `FORMAT` in the script and `svStatesUrl` together whenever a row's
  meaning changes, and upload before deploying the reader.

Cattle has a sidecar in the same format, from
`website/pangenome-config/buildBovineSvStates.sh`
(`…/bovine-arsucd12/sv-states/bovine-arsucd12-minigraph.sv-states.v2.tsv.gz`,
2.6 MB, 153,334 rows, built 2026-10-20):

- **Each assembly is one haplotype**, named by its code (`ANG`, `YAK`), because
  `vg deconstruct` writes one haploid column per assembly. The packer reads it
  with `--haploid`.
- **The build keeps only top-level records.** `vg deconstruct -a` writes every
  nested snarl beside its parent; none of the 11,441 nested records lacks one,
  so nothing is restored and every no call is `.`.
- **An inversion is an ALT whose traversal walks a node backwards**
  (`invertedAlleles`, `--traversals`), since minigraph writes no INV flag: 196
  rows.
- **A form needs 1% of the haplotypes, at least one** (`minCarriersFor`): HPRC's
  462 give 5, cattle's 11 give 1. With HPRC's 5, a yak-only deletion would fold
  into the majority.
- **A focused row opens no lanes and cuts no graph**: cattle has no lane track
  and no walk file, so "Open in JBrowse" stays on the first launch.

A lane draws its haplotype's gene models when the config has a track declared
for that haplotype's assembly alone, which is the rule `MultiWaySyntenyDisplay`
applies; there is no spec key for it. So every HPRC release 2 haplotype is an
assembly in `hprc-grch38.json`, and each of the 462 that CAT annotates has a
gene track (HG002's two have none). Two scripts keep it that way:

- **`website/generatePangenomeHaplotypes.ts`** writes the haplotype half of the
  config and each assembly's `chrom.sizes`, read off the release 2 assembly's
  `.fai`. Measured with all 465 assemblies on 2026-09-17, the haplotypes add
  ~0.1 s at boot and 19 KB gzipped, and nothing per launch beyond the lanes it
  opens, because jbrowse-web loads an assembly only when something reads it.
- **`website/pangenome-config/buildHprcGenes.sh`**, on the build box, reduces
  each CAT annotation to one transcript per named gene as BED12
  (`generatePangenomeGeneModels.ts`) and publishes it under
  `jbrowse.org/pangenome/hprc-grch38/genes/`, ~2 MB a haplotype (the sizes are
  in PANGENOME_PORTAL.md). It keeps what it has built.

Then `upload.sh` publishes the config. `pangenomePanels.test.ts` fails if a
haplotype the lane track maps has no gene track, other than HG002's.

Two things keep the lanes drawing, and when either breaks the lanes disappear
with no error:

- **A haplotype the track maps to an assembly must be that assembly's alias.**
  The launch filters by PanSN prefix (`HG00099#1`) and the adapter names a
  mapped lane after the assembly (`HG00099.1`); only an alias lets the display
  match the two as one lane. Without it the CFHR panel drew 6 of 8.
  `pangenomeLinks.test.ts` pins it against the config.
- **`pnpm check-pangenome-launches` reads the lanes back**, lane by lane, rather
  than the display type, which passed on 2026-09-17 while every lane on every
  host errored. That fault was in the graph plugin, which read
  `@jbrowse/synteny-core` from a host global the RPC worker serves as UI stubs,
  and a stub stringifies to `''` (fixed in the plugin, `5d05a20`). The check's
  `--local` pauses only the urls it substitutes: puppeteer's request
  interception stalls every request the worker makes, so under it no track data
  loads and a lane check can only fail. The check also fails a lane whose
  haplotype has a gene track and reads "no annotation" or never fetches its
  genes, which is how an unpublished `hprc-grch38.json` shows up without
  `--local`.
