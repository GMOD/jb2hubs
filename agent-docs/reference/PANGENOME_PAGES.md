---
name: pangenome-pages
description:
  'How the /pangenomes pages, the graph config in the bucket, the lane-width
  rule and the haplotype panels work, and what was removed from them.'
---

# The pangenome pages

Moved out of the root `CLAUDE.md` on 2026-10-08, which keeps the rules. Dated
measurements and incidents read as written at the time.

## The pangenome graph config is ours, and it lives in the bucket

`website/pangenome-config/hprc-grch38.json` is the config every graph launch on
`/pangenomes/*` opens (`graphBrowser.configUrl` in
`website/src/components/pangenomeDataset.ts`). It is published to
`s3://jbrowse.org/pangenome/hprc-grch38/config.json` by `upload.sh` beside it,
with an `upload_if_changed` stamp, because jbrowse-web fetches `?config=` from
the visitor's browser and genomes.jbrowse.org sends no CORS headers — only the
bucket does. **Run `website/pangenome-config/upload.sh` before deploying a
change that touches it**; a launch naming a config the bucket lacks fails to
fetch. The data it names stays under `jbrowse.org/demos/hprc/`, built in the
jbrowse-components repo (its README there says how).

The plugin url is the plugin store's `latest/` entry point
(`jbrowse.org/plugins/jbrowse-plugin-graphgenomeviewer/latest/…esm.js`), where
jbrowse-plugin-list rehosts the release its `GraphGenomeView` entry pins. The
plugin links an unreleased `@jbrowse/render-core`, so a pinned release stops
booting as `main` moves, and keeping it booting means bumping that pin. It
error-pages every released host (`createSvgIcon` — re-measured 2026-08-26 on
`latest` = v4.3.0). `features.pangenome` waited on v5 for that reason until
2026-10-08, when it went to production: since 2026-09-12 every launch on the
site targets `main`, where the plugin boots, so the constraint moved onto
`JBROWSE_BASE`, which cannot point at a release the plugin error-pages.

`pnpm check-pangenome-launches` boots every launch of every dataset on `main`,
including one whole-chromosome tier launch each, and reads back which tier the
graph track cut; run it after touching `pangenome*` or a config, with
`--dataset` to narrow it. Until 2026-10-08 it booted HPRC alone, and the other
three graphs' launches were tested for url shape only. The JBrowse docs'
pangenome tutorials (`website/docs/tutorials/pangenome_hprc.md` and its
`pangenome_*` siblings in jbrowse-components) describe these pages, so a visible
change here should be reflected there.

### One graph, one route, and almost no prose

`/pangenomes/<id>` — `hprc`, `mouse`, `bovine`, `arabidopsis` — is a page per
graph, rendered by `website/src/pages/pangenomes/[dataset].astro` from the
dataset. `/pangenomes` is a list of them and nothing else. A graph's page is one
sentence, a line of links, the **Gene or region** box with the dataset's loci as
a row of examples under it (`PangenomeRegionBox.tsx`, `pangenomeExamples.ts`),
the chromosomes as questions to the box (`?region=chr1`), and the file table.
The box is the page's only client JavaScript and the page has no style rule of
its own: the site's table rules, the shared query row (`GeneCombobox` and
`.ui-form` from `ui.css`, the controls /gene and /protein-browser use, so a gene
symbol is suggested as it is typed), `ui.css`'s `.ui-views` and `.ui-embed` for
the viewer, and the browser's defaults are the whole design, on purpose, after
the 2026-09-16 review found the previous page a wall of prose and buttons.

The box replaced the loci table on 2026-10-08. The table was 22 rows of five
launches on HPRC (136 links, 2,629 px) and, on the three derived catalogues,
twenty bubbles ranked by segment count, half of them labelled "intergenic": a
page that read as a list of hard regions. Now a reader names a gene or a region,
or clicks an example, and the answer is that one window: what it opens as
(`regionLaunches` in `pangenomeLinks.ts`, each launch with a line saying what it
draws) and, where the dataset publishes a structural-state sidecar, which forms
the haplotypes carry there (see "A locus's haplotypes are lanes" below). The
HPRC page is 974 px before a question. What the table had that the box does not:
the variation class column, the gene hub link, and launches that work without
JavaScript.

**The answer is drawn in the page.** Until 2026-10-09 it was a list of links,
each opening JBrowse in a new tab under a button that said "Show". Now a row of
chips, one per launch, picks which one an iframe under it loads, with an "Open
in full JBrowse" link beside them (`LaunchViewer` in `PangenomeRegionBox.tsx`).
The pick rides in the url as `?view=` and holds across questions. The frame
loads the launch url itself, so `check-pangenome-launches` still boots what the
page shows. An iframe and not `@jbrowse/react-linear-genome-view`, because the
graph plugin boots only on jbrowse-web `main` (see above) and the site's
`@jbrowse/core` is 4.3.0. jbrowse.org sends no `X-Frame-Options` or CSP header,
checked 2026-10-09; one added there would blank the viewer and leave the link.

**The matrix is ordered to match the table.** On HPRC, `regionAnswer` hands the
launches every placed haplotype grouped by structural form, commonest first
(`MatrixRows` in `pangenomeLinks.ts`), and the matrix takes it as `rows.domain`,
so each form is one block of rows in the order the forms table lists them. A
phased row is `<sample> HP<n>` from 0, and sidecar `#1` is `HP0`: at CFHR the
sidecar's 138-member deletion form and the VCF's 138 carriers of the 84,685 bp
deletion are the same set in `wave` and `pgbi`, and the other mapping matches
nothing (checked 2026-10-09).

**A haplotype the sidecar calls nowhere in the window draws no row**
(`rows.kept`, only when there is one). On chrX that is each male's first
haplotype. `wave.vcf.gz` writes it as a no call (`.|1`), and `pgbi.vcf.gz` wrote
a male's one X as both alleles (116 samples, no heterozygous call among 133,632
at FLNA), so his X drew twice there. Those haplotypes have no lane either, and
the page's sentence counts them.

**The matrix reads the release's normalized callset, `wave.vcf.gz`, as it is.**
vcfwave realigns each bubble allele to the reference, so a deletion spans the
bases it removes and an insertion sits at one; the display keeps an insertion at
that base (`showInsertionGlyphs: false`), colors cells by its own `svType`
preset, and draws a variant lane of marks above the rows (labels off: a record's
ID is its graph path). It read `pgbi.vcf.gz`, PanGenie's input, until
2026-10-09: there a record is a whole bubble allele, so a 6 kb REF against a 40
kb ALT drew an insertion as a block over reference the haplotype keeps, and a
net-length color rule on top of it ("replacement" for an inversion) was
vocabulary no VCF has. Measured on wave that day:

- **HP's 1.7 kb deletion is there**, 190 carriers, with no top-level filter; the
  filter was why `wave` lost it before.
- **vcfwave leaves an allele past its realignment length whole.** CFHR's 85 kb
  region has, besides the deletion, a same-length 84,685 bp REF to ALT record
  129 haplotypes carry, which draws as a full-width bar.
- **One event can be several ALT alleles**, split by flanking sequence: GSTM1's
  18 kb deletion is alleles of AC 150 and 241 in one record. Under the default
  colors, by allele index, they interleave inside one block; `svType` paints
  both red.
- **`svType` classes a record, not a haplotype's allele.** A record whose
  alleles disagree is "Other / mixed": C4's 33 kb module record holds the
  deletion and the insertion, so the 57 haplotypes that only delete draw black
  with the rest. A same-length allele has no class, so CFHR's record reads
  "Deletion" and its 111 same-length carriers draw red beside the 138 who
  delete. The FLNA inversion is "(no value)": vcfwave marks it with an `INV`
  flag, which the preset does not read. Splitting the records one allele each
  (`bcftools norm -m -any`) would make the class each carrier's, at the cost of
  rehosting the callset.
- **A window's records are 1.9 to 16 MB** (MHC class II the largest), under the
  20 MB `fetchSizeLimit`. `wave` carries a CHM13 column, which sorts below the
  panel.
- **The `callsetBlank` flags were measured on `pgbi`.** On `wave`, SMN has 515
  records where `pgbi` had none, and AMY1 and PRSS have insertions that draw at
  one base. UGT2B17's 117 kb deletion is still a skipped path, and NPHP1, SRGAP2
  and DEFB are still near empty. The flags stand until each is looked at.

Cattle keeps its breed rows. Its callset is `vg deconstruct` run here over the
published minigraph graphs, whole bubble alleles like `pgbi`, and nothing has
normalized it.

Naming 462 rows puts a launch at ~12 KB, and CloudFront answers 414 past about 8
KB, so `specUrl` moves a long url's params into the hash, which jbrowse-web
`main` reads the same way.

At CFH / CFHR the three agree at a glance, which is why it is the example the
screenshots use: the graph's 84.7 kb skip edge runs from CFHR3 to CFHR1, the
matrix's deletion block covers the same span, and the table's second row says
138 haplotypes (29.9%) carry it. GSTM1 (its deletion on 68% of haplotypes) and
C4A / C4B (the RCCX module and the C4 long and short forms) read nearly as well.
MHC is too dense to read in the frame, and HP and KIR draw almost empty
matrices.

A page screenshot paints the cross-origin frame blank while the frame itself has
drawn: capture the iframe as an element and paste it in.

- **A curated locus is one window of at most `MAX_DETAIL_WINDOW_BP`.** Each used
  to carry a display span too (MHC's 5 Mb) with the launch window as a
  `detailWindow` inside it; nothing opened the span once the table went, so it
  went on 2026-10-08, and a test holds every HPRC window to the limit. Two
  non-human examples are wider on purpose, cattle `defb` and Arabidopsis `knob`,
  and `pangenomeExamples.test.ts` lists them by id.
- **`regionAnswer` (`pangenomeAnswer.ts`) is the whole answer**: the window, its
  title, the forms and the launches. The box renders it and
  `check-pangenome-launches` calls it, so the check boots what the page offers.
- **A haplotype with no call at any site in the window is in no form and gets no
  lane**, on any chromosome, and the answer's sentence counts them ("116
  haplotypes are not aligned at any of them and have no lane").
  `structuralForms` returns them as `unplaced`. On chrX they are the 116 male
  haplotypes without one; at defb they are 390 and at nphp1 5, the two empty
  lanes `check-pangenome-launches` excused by name until 2026-10-08. A deletion
  spanning a whole window is not among them: it reads `_` under the restored
  parent that sizes it, and keeps its lane.
- **A lane says what its form is.** `describeForm` (`pangenomePanels.ts`) reads
  the form's key against each site's size changes in the sidecar: "as the
  reference", "85 kb deletion", "inversion". Up to two size changes are listed;
  more are counted with the largest named ("39 size changes, largest a 19 kb
  deletion" at MHC class II), since a list of sizes says nothing. A deletion
  spanning nested sites is a size at its restored parent's row: UGT2B17's 229
  read "120 kb deletion" and RHD's 86 "70 kb deletion". "Not aligned at N sites"
  is a `.` in a form with calls elsewhere, and "a rarer change at N sites" a
  state under `MIN_CARRIERS` at a site where most haplotypes have no call. Over
  the 22 examples on 2026-10-08, 6 lanes still say "not aligned" (two each at
  mhc-hla, smn and nphp1) where 26 lanes at 10 examples said "skips N sites",
  and 2 say "rarer" (smn, defb).
- **A lane whose form is a deletion spanning the window draws nothing, and is
  right.** The graph has no walk for the haplotype there, so the track opens no
  row for it: 4 of SMN's 8 lanes, each a 190 to 250 kb deletion in a 1.6 Mb
  snarl around the 60 kb window. `structuralPanel` marks a form that bypasses
  every site it does not delete and whose deletion is at least the window's
  length (`mayDrawEmpty`), and `check-pangenome-launches` accepts a missing row
  only for those, as a note. A shorter deletion leaves a flank, so the check
  requires a row for UGT2B17's 120 kb in 150 kb, RHD's 70 kb in 85 kb and AMY1's
  94 kb in 150 kb.
- **An example is its locus's window as a locstring**, and the box recognises
  the text to title the answer and to drop the graph launch for a
  `graphCollapsed` locus. Every dataset's examples are curated loci, under
  "Examples" (see "Every dataset's examples are curated" below).
- **Every dataset has the box.** Without a sidecar it resolves the window
  against `graphBrowser.chromosomes` and offers the launches alone. Gene symbols
  go through mygene.info, whose coordinates matched all four references on
  2026-10-08 (cattle checked on BTNL2, RHOBTB2 and DEFB4A against bosTau9).
- **The question rides in the url as `?region=`.** A window past
  `MAX_DETAIL_WINDOW_BP` (150 kb) gets the graph, plus the bubble lanes where
  the dataset has no callset, since a callset has no coarse tier.
- **No panel is committed.** `panels.json` and `generatePangenomePanels.ts` went
  on 2026-10-08, once only the check and the unit tests read them.
  `check-pangenome-launches` asks the live sidecar for each example's window the
  way the box does and boots what `regionLaunches` returns, so the check opens
  the urls the page offers. The unit tests use a fixed haplotype list.

`/pangenomes/explorer` was a separate app until that day — a card grid of loci
with class filters and a per-locus dashboard of four bar charts computed by
`generatePangenomeData.ts` over the callset, plus a "hero" banner of seven
buttons on each graph's page pointing at it. All of that is gone, along with
`portal.css`, the per-locus `*.vcfsummary.json` summaries, the `notes[]`
caveats, the per-locus `significance` sentences and the PangyPlot fallback
(`externalGraphBrowser`), which only the old region box ever reached; a locus
table replaced it, and the box above replaced that. Its redirect stub went on
2026-10-04, once neither the JBrowse tutorials nor the published docs linked the
route.

### One rule decides how wide a window is drawn, and it removed four surfaces

`lanes()` in `website/src/components/pangenomeLinks.ts` picks the segment-level
lanes under `MAX_DETAIL_WINDOW_BP` (150 kb) and the coarse bubble tier above it.
A graph launch (`graphRegionUrl`) is one linear view: a compact gene row, the
segments track opened as its `LinearGraphDisplay` at 420 px, the callset's
haplotype matrix where the window can draw it (`drawsCallset`), then those
lanes. The narrow lanes were bubbles and the allele inventory, an
AlignmentsTrack of one row per allele, until 2026-10-09: it said nothing about
who carries an allele and confused readers, and the matrix says exactly that.
Mouse and Arabidopsis have no callset, so their narrow lane is the bubbles
alone; a matrix there needs `minigraph --call` per assembly (see
`pangenomeDataset.ts`). The graph picks its own tier by zoom past the adapter's
`coarse.aboveBpPerPx`. The lanes came first until 2026-10-08, which put the
graph 732 px down a 900 px window and 1,415 px down under Arabidopsis's SyRI
rows. The segments lane and the graph are one track and a view shows a track
once, so a graph launch has no segments lane, and no tier lane either: the
graph's handover turns on the view's width, so at 1000 px HPRC's graph stays
fine to ~1 Mb while a lane switched at 150 kb would already be coarse. Every
rGFA track in the four configs is a `GraphTrack`, which opens as the graph, its
first display, so a lane over one names `LinearBasicDisplay`. A GraphTrack's
displays come from the plugin, not the config, so `pangenomeLinks.test.ts`
checks every launch against the ones the plugin registers on it. Everything
below fell out of the width rule on 2026-09-10, so a change here is a change to
all of it:

- **`graphChromosomeUrl` is gone.** A chromosome is the widest region and takes
  the coarse branch, so the whole-chromosome launch and the region launch are
  one builder — and the page's chromosome row is a row of links rather than a
  second control.
- **A wide catalog locus has a launch at all.** `graphLocusUrl` used to return
  undefined without a detail window, and `locusLaunchUrl` opened the allele
  inventory (an AlignmentsTrack, 379 rows over mouse's top entry) across
  multi-megabase spans. Half of each derived catalogue the non-human pages then
  listed was such a cluster — 10 of mouse's 20, 12 of cattle's.
- **No region has an upper bound.** `MAX_GRAPH_REGION_BP` existed because the
  view refuses a cut past its `maxRegionBp`; a coarse cut has no bp cap.
- **There is no landing locus.** `landingRegion` and then `preferredLocus`
  answered "which locus does this catalogue open on" for a headline launch and
  the launch-only region box, neither of which exists any more; a reader picks a
  row.

The one asymmetry that stays: the callset does **not** get a coarse tier, so
`regionLaunches` offers no variants launch past `MAX_DETAIL_WINDOW_BP`, and the
graph launch carries no matrix there. That is a property of a VCF, not of the
wiring.

### Every dataset's examples are curated

Mouse, cattle and Arabidopsis each offer seven named loci, in
`pangenomeMouseLoci.ts`, `pangenomeBovineLoci.ts` and
`pangenomeArabidopsisLoci.ts` beside HPRC's 19 in `pangenomeLoci.ts`. Until
2026-10-08 those three pages offered a derived catalogue under "Most variable":
`generatePangenomeLoci.ts` ranked each graph's coarse tier by segments per
bubble and named the entries off the reference annotation, committed as
`public/pangenome-<id>/loci.json`. The ranking found real places and labelled
them "Gm10439 +10", "LOC790886" and "AT4G05215 +19": RPP5 was the derived entry
"AT4G02965 +23". The ranking also never found a single-event locus (Nnt, Mx1,
POLLED, RPM1), each one allele in a quiet window with a segment count of 3 to 9.
The generator, the three files and the `derived` field went with the catalogue.

Each curated window was measured on 2026-10-08 with ranged `tabix` reads of the
dataset's published `.bubbles.bed.gz`, `.alleles.bed.gz` and
`.tier10000.segs.bed.gz`, plus `.vcf.gz` for cattle and `syri_regions.bed.gz`
for Arabidopsis. Gene coordinates came from the UCSC REST API's `ncbiRefSeq`
track (mm39, bosTau9) and mygene.info species 3702 (TAIR10). No bubble crosses a
window's edge, the rule AMY1's comment states for HPRC. The measured sizes are
comments on each locus, and the loci measured and declined are listed at the top
of each file.

Three traps when re-measuring a window against the published files:

- **The bubble and tier files name sequences in PanSN** (`mm39#0#chr4`,
  `bosTau9#0#chr6`, `TAIR10#1#Chr4`), and the allele files and the VCF use the
  bare name. A bare-name query against the bubble index returns nothing, which
  reads as a flat graph.
- **`tabix` on a url writes the `.tbi` into the working directory.** Run it from
  a scratch directory.
- **The mouse and Arabidopsis graphs record no carriage.** The allele file's
  `firstSeenIn` is the first assembly, in build order, to add the node, so it
  can rule a strain out and never rules one in. Only cattle, through the VCF,
  says which breed carries what.

**The descriptions name the locus and claim nothing about strains or breeds.**
The proposal's phenotype and carrier claims were cited from memory, and only the
KIT one (Milia et al. 2025, Genome Res 35:1041) was checked. Verify a citation
before a description says which strain or breed carries an allele.

Windows measured the same way and not offered, any of which can swap in. The
columns are the bubble index's rows in the window, allele rows of 1 kb or more,
the largest allele row, and the segments in the largest coarse-tier bubble
(blank where none reaches the tier's 10 kb floor):

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

### Every link was booted and looked at on 2026-10-08

An audit opened all 202 links the four pages offered on `main` from the build
box, at 1400 by 900: every example's launches, its BandageJS link and every
whole-chromosome link. Each was timed until its screenshot stopped changing.
Medians to drawn: variants 1.7 s, graph 2.5 s, bubbles 2.5 s, a whole chromosome
3.2 s, haplotype lanes 4.7 s, BandageJS 5.3 s; the slowest link that drew took
7.0 s. Speed was not the problem. What a link showed was, and each of these is
now a rule in `pangenomeLinks.ts` or a flag on a locus:

- **The graph launch opens the graph first** (above).
- **`callsetBlank` on a locus drops its variants launch**, for the example and
  for a typed window that overlaps it, the way `graphCollapsed` drops the graph.
  The matrix was a flat grey block at AMY1, MNS, PRSS, UGT2B17 and NPHP1, whose
  records of 50 bp or more are absent or too small to draw at the window's zoom.
  At SMN the callset has no record at all and the track never left "Loading…";
  given three minutes it took the browser down. A window nobody curated can
  still land on such a hole.
- **SRGAP2 and DEFB (8p23.1) are no longer HPRC examples.** No launch of either
  showed anything: a 5-node and a 7-node graph, a blank or hung matrix, and no
  panel (SRGAP2) or one lane (DEFB). The callset has no record between
  chr8:7,546,668 and 8,096,808.
- **SMN1 / SMN2 is no longer an HPRC example either.** With no graph launch and
  no variants launch, its one launch drew 4 of 8 lanes, the commonest labelled
  "a rarer change at 1 site", over 24 forms.
- **A dropped example stays in `PANGENOME_LOCI` as `unlisted`.** A typed window
  reads `graphCollapsed` and `callsetBlank` off the loci, so deleting SRGAP2 and
  DEFB had given a typed DEFB window back the variants launch that hangs. All
  three are unlisted loci now, and HPRC offers 19 examples.
- **The BandageJS link names `maxNodes=40000`.** MHC class II (33,010 nodes) and
  KIR (23,021) stopped on BandageJS's "over the 20,000 this page draws by
  default" question, and draw in 14 s and 7 s once past it. LPA is 19,465.
- **A window over 10 Mb opens no gene lane** (`MAX_GENE_LANE_BP`). The lane was
  a "Too many features" banner on 58 of the 78 whole-chromosome launches, and
  the graph labels its own genes at that zoom.

- **Arabidopsis's knob offers no graph launch** (`graphCollapsed`). The graph
  has no bubble for the inversion and drew a straight line; the Bubbles launch
  shows it in SyRI's rows. The flag applies to a wide window only when the locus
  holds all of it, so Chr4 still opens as a graph.
- **The variants launch opens two UCSC tracks under the matrix, not four.** The
  insertion and deletion tracks were mostly 1 bp records and their labels, and
  pushed the inversion and duplication tracks off a 900 px window.

Seen and left alone: Arabidopsis RPP5 (1,207 nodes) and RPP1 (1,130) and cattle
DEFB (1,114) draw as dense knots.

Screenshotting launches in parallel needs one browser per worker, since a
background tab does not paint. A display's `isLoading` says whether a track is
still fetching.

### What a pangenome page is not

It was 15,286 px rendered, and ~10,000 of that was a static 232-row HPRC sample
table plus two mouse-strain tables. `/hubs/HPRC` is a searchable version of the
first and the page's own prose already linked it; the accession pages cover the
other two. All three are links now, `website/src/hprcSamples.json` and its two
siblings are deleted, and HPRC renders through `[dataset].astro` like the other
two rather than being hand-written beside it — which is what finally gave it the
projections table and the caveats list the other two always had.

Two whole features came out with them, and neither is worth rebuilding as-is:

- **The per-locus MSA panel** (`generatePangenomeMsa.ts`, `PangenomeMsaSection`,
  `MsaPanel`) reconstructed 465 haplotypes over one 800 bp window per locus. It
  was 8.1 MB of the 8.4 MB committed under `public/pangenome/`, HPRC-only, and
  its first paint on the headline locus is 465 rows of dashes, because the
  window-picker ranks by indel-weighted variation and lands inside a `GAA`
  expansion one haplotype carries. Note that this did **not** remove the
  react-msaview dependency or the `@jbrowse/core` patch — `/protein-browser`
  used `MSAViewer` directly until it dropped its embedded alignment on
  2026-10-09, which took both with it.
- **The pangene copy-number matrix** (`generatePangenomePangene.ts`,
  `PangeneMatrix`) drew 100 haplotypes from lh3's `human100` graph under charts
  computed over HPRC's 232 samples. Two cohorts, one locus, and the caption was
  the only thing saying so.

`markerGenes` on a `PangenomeLocus` was the surviving half of the second, read
for the gene-hub link, and went with the loci table on 2026-10-08.

### A locus's haplotypes are lanes, and the callset picks which

The Haplotypes launch (`haplotypeLanesForRegion`) opens the
`hprc_v2_1_gbz_lanes` track, one lane per haplotype walk read from HPRC's
`.gbz.db` in the browser, narrowed to the window's panel: one haplotype per
structural **form** in the window, commonest first, every form where there are
at most 10 and the commonest 8 otherwise. The panel rides the spec as
`rows.kept` and `rows.domain`, so one track in the config serves every window.

**The forms come from a genome-wide sidecar, not from a per-locus read of the
callset**, which is what makes the same question answerable for a window nobody
curated. `website/pangenome-config/buildHprcSvStates.sh` publishes one
tabix-indexed file of every structural record in the callset — where it is, what
each state does to the reference's structure, one character per haplotype, 19 MB
for the genome — and `structuralForms` (`pangenomeSvStates.ts`) groups a
window's haplotypes out of a ranged read of it, a few KB and about 300 ms. The
box on the page (`PangenomeRegionBox.tsx`) runs it and `structuralPanel`
(`pangenomePanels.ts`) in the reader's browser for an example, a locstring or a
gene symbol, over a window of up to 150 kb, and `check-pangenome-launches` runs
the same two functions over each example before booting it. An example and the
same window typed in the box cannot disagree, because neither has rules of its
own.

Two things the sidecar fixed rather than moved, both measured 2026-09-17. The
old rule read the 2.3 GB callset with bcftools at five seconds a locus. And it
filtered on `LV=0`, which is not "top level" in this file: vcfbub removes a
parent snarl with an allele over 100 kb and keeps its children, and all 425
parents that nested records name genome-wide are absent, so the filter dropped
real variation — HP's panel was 457 against 5 over a rare 302 bp deletion and is
now 260 / 184 over the 1.7 kb deletion 40% of haplotypes carry. 19 of the 20
loci have a panel where 15 did; srgap2, whose window holds no structural record
at all, is the one that does not. Why a panel and not the tutorial's eight, why
10 and 8, and what a "form" is: `agent-docs/reference/PANGENOME_PORTAL.md`.

The sidecar's rows since format `v2` (2026-10-08), with the measurements behind
each rule in `agent-docs/reference/PANGENOME_PORTAL.md` ("The sidecar's no call
is two states"):

- **The removed parents are rows.** The build reads each from the release's 24
  GB `raw.vcf.gz` by a ranged query over its children and keeps its allele
  lengths: 426 snarls, 422 rows. A parent fewer than `MIN_CARRIERS` haplotypes
  are called at is no row, which drops defb's 5.2 Mb one.
- **A restored row states what its children do not.** Its allele sums every
  child's, so each haplotype's size change has the changes at the rows directly
  under it taken out, and what remains under 1 kb (`RESTORED_STRUCTURAL_BP`) is
  the reference's structure. 248 of the 422 rows then carry no size 5 or more
  haplotypes share.
- **`_` is a no call under a snarl that calls the haplotype, `.` one that no
  snarl above calls.** `_` has no size of its own; the parent's row has it.
  581,424 of the earlier file's 8,169,115 no-call states became `_`.
- **A rare state folds into its site's majority, except a call into a no-call
  majority**, which stays apart as `~` and reads "a rarer change".
- **The object name carries the format** (`…sv-states.v2.tsv.gz`), and the build
  copies to the bucket and never syncs, so the file deployed pages read stays.
  Bump `FORMAT` in the script and `svStatesUrl` together whenever a row's
  meaning changes, and upload before deploying the reader.

A lane draws its haplotype's gene models when the config has a track declared
for that haplotype's assembly alone, which is the rule `MultiWaySyntenyDisplay`
applies; there is no spec key for it. So every HPRC release 2 haplotype is an
assembly in `hprc-grch38.json`, and the 462 that CAT annotates each carry a gene
track (HG002's two have none). Two scripts keep it that way:

- **`website/generatePangenomeHaplotypes.ts`** writes the haplotype half of the
  config and each assembly's `chrom.sizes`, read off the release 2 assembly's
  own `.fai`. Measured with all 465 assemblies on 2026-09-17: ~0.1 s more at
  boot and 19 KB gzipped, and nothing per launch beyond the lanes it opens,
  because jbrowse-web loads an assembly only when something reads it.
- **`website/pangenome-config/buildHprcGenes.sh`**, on the build box, reduces
  each CAT annotation to one transcript per gene as BED12
  (`generatePangenomeGeneModels.ts`) and publishes it under
  `jbrowse.org/pangenome/hprc-grch38/genes/`. That is ~3.4 MB a haplotype
  against 129 MB for CAT's own GFF3 bgzipped, because a lane draws one model per
  gene and CAT repeats a ~30-field attribute block on every exon row. HPRC's
  files are plain gzip in gene order, so they are rehosted rather than read in
  place. It keeps what it has built.

Then `upload.sh` publishes the config. `pangenomePanels.test.ts` fails if a
haplotype the lane track maps has no gene track, other than HG002's.

Two things keep it drawing, and both fail silently:

- **A haplotype the track maps to an assembly must be that assembly's alias.**
  The launch filters by PanSN prefix (`HG00099#1`) and the adapter names a
  mapped lane after the assembly (`HG00099.1`); only an alias makes the display
  see one lane. Without it the CFHR panel drew 6 of 8. `pangenomeLinks.test.ts`
  pins it against the config.
- **`pnpm check-pangenome-launches` reads the lanes back**, lane by lane, rather
  than the display type, which passed on 2026-09-17 while every lane on every
  host errored. That fault was in the graph plugin, which read
  `@jbrowse/synteny-core` from a host global the RPC worker serves as UI stubs.
  Its `--local` pauses only the urls it substitutes: puppeteer's request
  interception stalls every request the worker makes, so under it no track data
  loads and a lane check can only fail. It also fails a lane whose haplotype has
  a gene track and reads "no annotation" or never fetches its genes, which is
  how an unpublished `hprc-grch38.json` shows up without `--local`.
