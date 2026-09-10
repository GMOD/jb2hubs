# Pangenome portal and demos: where things stand after 2026-09-09

Point-in-time. The durable reasoning is
[PANGENOME_PORTAL.md](../PANGENOME_PORTAL.md); this is only what is open, in the
order it is worth doing. Work spans two repos — GMOD/jb2hubs and
GMOD/jbrowse-components — and the commits are named on each side.

## What changed, in one paragraph

The mouse and bovine pangenomes were already built and serving from
`demos/{mouse,bovine}_pangenome/` with no build script in git and no config in
either repo. They now have both, a variant route for cattle, a tutorial with
four figures, a locus catalogue that is **derived rather than curated**, a
portal that reads all of it, and — as of the end of the day — both halves
actually published. What is left is one long compute and one version bump.

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
| the configs published, run.sh publishes them   | `767d83faf5f`                | `34f7d922cb` (figures.lock)           |
| plan corrections                               | `3c07e73fc4d`, `56dcca97c91` |                                       |

## Both publishes are done, and one of them found a silent no-op

`website/pangenome-config/upload.sh` ran and all three configs are live and
byte-current; `pnpm figures:push` ran and `check-figure-refs` reports all 473
doc references resolving against 592 figures. Neither check is red any more.

The upload is worth reading about, because it exposed two further things:

- **`run.sh` published these configs on no path at all.** That is the root cause
  of the day-long 404, not forgetfulness — `upload.sh` was a hand step and
  nothing in any deploy called it. `publish_pangenome_configs` now runs on both
  the production and the staging path (`767d83faf5f`); staging skips S3 for
  everything else because the data is shared, but these configs are exactly what
  a staging launch fetches from that same bucket.
- **`cloudfront_invalidate "/pangenome/*/config.json"` was a no-op.** CloudFront
  requires the `*` to be the LAST character of an invalidation path. A mid-path
  wildcard is accepted, reports `Status: Completed`, and matches nothing — so
  after the publish the edge went on serving the previous hprc config for twenty
  minutes while the two configs that had never been cached read correctly. That
  pattern is exactly what makes it look like propagation delay rather than a
  no-op; `/pangenome/*` took effect on the first poll. Every other
  `cloudfront_invalidate` call in this repo already used a trailing wildcard, so
  this was the only one.

The asset check learned two distinctions in the same pass, both of which fired
for real within the hour:

- **only 404/410 fails it.** Minutes after it first found anything, hgdownload's
  primary stopped completing TLS while hgdownload2 served all three 2bit files
  at 200, and the check exited 1 on three good urls — which in `gate_configs`
  blocks a deploy on someone else's bad minute. It classifies like
  `checkTrackUrls.mjs` now: `gone`, `primary-only`, `transient`.
- **a mismatch is re-read past the edge**, so "published, invalidation in
  flight" is a note rather than a failure. Without that, a publish that worked
  reports as a config that is not published, and the fix a reader would try is
  to publish again.

**One thing left in the bucket for a human:**
`s3://jbrowse.org/pangenome/bovine-bostau9/config.json`, 3,362 bytes from
2026-09-02, is an orphan — the bovine config was renamed to `bovine-arsucd12`
and the old key was never pruned. Nothing names it (the dataset, the page and
`check-pangenome-assets` all read the new one), so it is inert, but it is the
same append-only-mirror class `check-orphan-configs` refuses to clean up on its
own for the UCSC tree. Deleting it is a retirement decision, which is why it is
written down here rather than done.

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

Nothing here is red. The next thing worth doing is mouse's `--call` route, which
is the last asymmetry between the three that anyone can close from here — hours
of compute on assemblies already on disk. HPRC v2.1 is the other, and it is a
one-pass job rather than a url edit.
