# Pangenome portal and demos: where things stand after 2026-09-09

Point-in-time. The durable reasoning is
[PANGENOME_PORTAL.md](../PANGENOME_PORTAL.md); this is only what is open, in the
order it is worth doing. Work spans two repos — GMOD/jb2hubs and
GMOD/jbrowse-components — and the commits are named on each side.

## What changed, in one paragraph

The mouse and bovine pangenomes were already built and serving from
`demos/{mouse,bovine}_pangenome/` with no build script in git and no config in
either repo. They now have both, a variant route for cattle, a tutorial with
four figures, a locus catalogue that is **derived rather than curated**, and —
as of the second half of the day — a portal that actually reads any of it. The
gap that is left is not code: it is two publishes and one long compute.

|                                                | jb2hubs                      | jbrowse-components                    |
| ---------------------------------------------- | ---------------------------- | ------------------------------------- |
| configs on one shape, `check-pangenome-assets` | `0be8ce7f39c`                |                                       |
| builders + doc rows                            |                              | `d89f7c3025`                          |
| bovine variant route                           | `751681a6c0c`                | `94f8d5bf43`                          |
| tutorial, fixture, four specs                  |                              | `abeea38092`, trimmed in `5ad0ca9f3f` |
| derived locus catalogues                       | `04d62efa1ec`                |                                       |
| the `published` half of the asset check        | `b7d8cd7c290`                |                                       |
| mouse + bovine as datasets the site reads      | `819c960b0bd`                |                                       |
| the portal page renders both off the dataset   | `7d9aa7433c5`                |                                       |
| Dock2 replaces the H2 figure; Nnt unclipped    |                              | `8ffddac841`                          |
| plan corrections                               | `3c07e73fc4d`, `56dcca97c91` |                                       |

## Blocking, and both of them are publishes

Neither is a decision about the work; both are a decision about pushing bytes to
a place readers see, which is why they were left.

**1. `website/pangenome-config/upload.sh` has not been run, and two configs are
wrong in the bucket because of it.** `pnpm check-pangenome-assets` says so on
every run now — that is what `b7d8cd7c290` added, and it found both the moment
it existed:

- `bovine-arsucd12.json` is **404**. It was committed on 2026-09-09, passed
  every other gate, and was written up in this file as live.
- `hprc-grch38.json` is live and **stale**: the served copy still names
  `hprc_tier`, and the tree renamed it to `hprc_minigraph_tier`. So every
  whole-chromosome graph launch on staging today names a track the visitor's own
  config does not have. `mouse-mm39.json` matches but carries no upload stamp.

One `bash website/pangenome-config/upload.sh` fixes all three. It stamps and
invalidates only what changed.

**2. The four figures are not in the store.** They render, they are reviewed,
and `website/static/img/` is gitignored, so they exist only on the machine that
made them. `check-figure-refs` is red until:

```
pnpm figures:push --exact --filter pangenome/mouse_nnt,pangenome/mouse_dock2,pangenome/bovine_bola,pangenome/bovine_whole_chromosome
```

then commit `figures.lock`. `pangenome/mouse_h2` is **not** in that list any
more — see below. Regenerate with `pnpm screenshots:build`, or plain
`pnpm screenshots` while `products/jbrowse-web/build` is from today; see
`test_data/graphgenomeview/README.md` for why a stale build costs five minutes
per figure and blames the wrong thing.

## Then: the two remaining data routes

Nothing on the site waits on these — a dataset with no callset now says why
rather than showing an empty panel — but they are what closes the last real gap
between the three.

- **Mouse's variant route.** `minigraph -cxasm --call` over the 19 assemblies
  already on disk, then `mgutils.js merge -r0`. Hours. Until it lands, mouse's
  `noCallsetReason` is the page's answer, and it is a true one.
- **HPRC v2.1.** 14 pins across four files, and not a url edit: the committed
  explorer summaries are derived from the v2.0 VCF, so the bump has to
  regenerate them in the same pass or the charts describe one file while the
  launches open another. `check-pangenome-assets` reports the gap every run.

## What the portal work left behind

Worth knowing before touching any of it again.

- **`graphVcf` is optional, and its absence is a property of the graph file.**
  Mouse's rGFA has no `P` or `W` lines, so no wiring makes a callset appear.
  Treat `noCallsetReason` as the honest answer rather than a placeholder.
- **`locus.derived` is the per-locus "nothing was precomputed" signal.** The
  dashboard skips the `<id>.vcfsummary.json` fetch and the MSA panel for such a
  locus and shows the tier's four numbers instead. Per locus rather than per
  dataset on purpose — a dataset could hold both kinds.
- **The two derived datasets are staging-only for a stronger reason than HPRC
  is.** `RgfaTabixAdapter` and `MinigraphBubbleAdapter` ship in the
  graphgenomeviewer plugin, not core, so their **linear** lanes are as v5-gated
  as the graph pane. On production a mouse locus has coordinates and the tier's
  numbers and no launch at all, and the dashboard says so in as many words.
- **Server-rendering the components is the cheap version of the launch check.**
  A vite SSR build of `PangenomeLocusDashboard` and `PangenomeExplorer` over all
  three datasets is seconds and it found the `syntenyGene` defect (a derived
  locus's composed label split into `Gm10439,`, `Vmn`, and a coordinate), the
  explorer's derived-note gate, and a triple-em-dash sentence. Do it after any
  change here; `pnpm check-pangenome-launches` is still the one that needs a
  browser and four live services.
- **Byte sizes in `PangenomePortal.sizes` are as of a measurement**, named in a
  comment beside each dataset. `check-pangenome-assets` probes every url they
  label, so a file that MOVED is caught; a file that merely grew shows a stale
  number until someone re-measures. That was a deliberate trade against a
  build-time fetch.

## `mouse_h2` is gone rather than fixed

It was on the page because H2 is what the mouse pangenome literature leads with
— reputation, not measurement, which is the thing `DEMO_DATASETS.md` warns
against — and rendered it was a competent picture of nothing: 44 bubbles and 94
segments over 150 kb, drawn as a chain with a scatter of 5–91 bp loops.

`pangenome/mouse_dock2` replaces it, and the window came out of the ranking
rather than the literature: one bubble, 524 segments over 44,453 bp of GRCm39,
alternate paths 3,943–114,372 bp, entirely inside one Dock2 intron. It is also
the only **force** layout in the file, decided by rendering both — anchored
gives 18 readable rank lanes that look like a denser Nnt panel; force gives 425
nodes and 580 edges as several large loops off one backbone. The page's note
tells a reader to check the node and edge counts before reaching for force, and
a rule with no counterexample on the page is a preference.

## Leads already chased, so they are not chased again

- **Base level is not the target, and reasoning from the pipeline's name gets
  this wrong.** HPRC's own graph tracks read `sv.gfa`, the minigraph stage, and
  its tutorial names the 63 GB base-level file only to say why it is unused.
  Taking cattle base-level would make it the odd one out. Zenodo's `cactus` and
  `pggb` sets stay unextracted on purpose.
- **The mouse minigraph-cactus rebuild is optional.** It buys the GBZ route and
  nothing else, and that route is human-only because HPRC publishes its own
  `.gbz.db` — we build only the companion index. Multi-day compute for one route
  of three, on the one dataset where no upstream has done it.
- **The mouse graph cannot express carriage at all.** Line census of the
  finished rGFA is `H`, `S`, `L` — zero path lines. `firstSeenIn` there is
  construction order.
- **`cw` cannot rank a bubble.** gfatools clamps a bubble's path count at
  INT32_MAX rather than overflowing, and every bubble at the top of the ranking
  is clamped. `cn` is the metric.
- **The derived catalogue's gene track is per-dataset.** bosTau9 publishes no
  `ncbiRefSeqSelect`, so a hardcoded track name returns nothing and every locus
  reads "(intergenic)" — an answer, not an error.
- **Running the derivation on HPRC has still not been done**, and it is the
  honest test of whether curation is buying anything: HPRC has a tier too, so
  the same ranking runs on it and would say how much of the curated set it
  recovers.
- **`generate-screenshots.ts`'s `buildJbrowseWeb()` never built anything** —
  `--filter jbrowse-web` against a package named `@jbrowse/web`. Fixed, but the
  class is worth remembering: pnpm exits 0 on a filter that matches nothing.

## If you pick this up

Run `upload.sh` and push the figures; that is both red checks and the one
genuinely broken thing in production-facing state (the bovine config a launch
cannot fetch). Then mouse's `--call` route, which is the last asymmetry between
the three that anyone can close from here.
