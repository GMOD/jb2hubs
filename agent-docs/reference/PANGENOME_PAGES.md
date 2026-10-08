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
the chromosomes as graph links, and the file table. The box is the page's only
client JavaScript and the page has no style rule of its own: the site's table
rules, the shared query row (`GeneCombobox` and `.ui-form` from `ui.css`, the
controls /gene and /protein-browser use, so a gene symbol is suggested as it is
typed) and the browser's defaults are the whole design, on purpose, after the
2026-09-16 review found the previous page a wall of prose and buttons.

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

- **A curated locus is one window of at most `MAX_DETAIL_WINDOW_BP`.** Each used
  to carry a display span too (MHC's 5 Mb) with the launch window as a
  `detailWindow` inside it; nothing opened the span once the table went, so it
  went on 2026-10-08, and a test holds every curated window to the limit.
- **`regionAnswer` (`pangenomeAnswer.ts`) is the whole answer**: the window, its
  title, the forms and the launches. The box renders it and
  `check-pangenome-launches` calls it, so the check boots what the page offers.
- **On `hemizygousChromosomes` the form with no call gets no lane.** 116 of the
  callset's 462 haplotypes have no call anywhere on chrX, the panel stood
  HG00126#1 for them, and every chrX window opened an empty lane; the full
  launch check caught it at FLNA on 2026-10-08, the first time FLNA had a panel.
  A deletion spanning a whole chrX window is dropped with them, which the
  sidecar cannot tell apart.
- **A lane says what its form is.** `describeForm` (`pangenomePanels.ts`) reads
  the form's key against each site's size changes in the sidecar: "as the
  reference", "85 kb deletion", "inversion". Up to two size changes are listed;
  more are counted with the largest named ("38 size changes, largest a 6.1 kb
  deletion" at MHC class II), since a list of sizes says nothing. A site the
  haplotype's path skips is said as "skips N sites", because the sidecar cannot
  tell a deletion from an unplaced haplotype, and the reference bases under the
  skipped sites are no deletion size: UGT2B17's whole-gene deletion skips 8
  sites covering 9.6 kb, and AMY1's commonest form skips 64 covering 4.3 kb
  (measured 2026-10-08). Saying which it is needs per-haplotype placement.
- **An example is its locus's window as a locstring**, and the box recognises
  the text to title the answer and to drop the graph launch for a
  `graphCollapsed` locus. A derived dataset offers its `MAX_DERIVED_EXAMPLES`
  highest-ranked bubbles that overlap a gene, under "Most variable".
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
A graph launch (`graphRegionUrl`) is one linear view: those lanes, then the
segments track opened as its `LinearGraphDisplay`, which picks its own tier by
zoom past the adapter's `coarse.aboveBpPerPx`. The segments lane and the graph
are one track and a view shows a track once, so a graph launch has no segments
lane, and no tier lane either: the graph's handover turns on the view's width,
so at 1000 px HPRC's graph stays fine to ~1 Mb while a lane switched at 150 kb
would already be coarse. Every rGFA track in the four configs is a `GraphTrack`,
which opens as the graph, its first display, so a lane over one names
`LinearBasicDisplay`. A GraphTrack's displays come from the plugin, not the
config, so `pangenomeLinks.test.ts` checks every launch against the ones the
plugin registers on it. Everything below fell out of the width rule on
2026-09-10, so a change here is a change to all of it:

- **`graphChromosomeUrl` is gone.** A chromosome is the widest region and takes
  the coarse branch, so the whole-chromosome launch and the region launch are
  one builder — and the page's chromosome row is a row of links rather than a
  second control.
- **A wide catalog locus has a launch at all.** `graphLocusUrl` used to return
  undefined without a detail window, and `locusLaunchUrl` opened the allele
  inventory (an AlignmentsTrack, 379 rows over mouse's top entry) across
  multi-megabase spans. Half of each derived catalogue is such a cluster — 10 of
  mouse's 20, 12 of cattle's.
- **No region has an upper bound.** `MAX_GRAPH_REGION_BP` existed because the
  view refuses a cut past its `maxRegionBp`; a coarse cut has no bp cap.
- **There is no landing locus.** `landingRegion` and then `preferredLocus`
  answered "which locus does this catalogue open on" for a headline launch and
  the launch-only region box, neither of which exists any more; a reader picks a
  row.

The one asymmetry that stays: the callset does **not** get a coarse tier, so
`regionLaunches` offers no variants launch past `MAX_DETAIL_WINDOW_BP`. That is
a property of a VCF, not of the wiring.

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
  uses `MSAViewer` directly.
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
each state does to the reference's structure, one character per haplotype, 18 MB
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
filtered on `LV=0`, which is not "top level" in this file: vcfbub pops a parent
snarl with an allele over 100 kb and keeps its children, and all 425 parents
that nested records name genome-wide are absent, so the filter dropped real
variation — HP's panel was 457 against 5 over a rare 302 bp deletion and is now
260 / 184 over the 1.7 kb deletion 40% of haplotypes carry. 19 of the 20 loci
have a panel where 15 did; srgap2, whose window holds no structural record at
all, is the one that does not. Why a panel and not the tutorial's eight, why 10
and 8, and what a "form" is: `agent-docs/reference/PANGENOME_PORTAL.md`.

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
