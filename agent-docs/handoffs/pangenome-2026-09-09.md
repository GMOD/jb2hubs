# Pangenome portal and demos: where things stand after 2026-09-09

Point-in-time. The durable reasoning is
[PANGENOME_PORTAL.md](../PANGENOME_PORTAL.md); this is only what is open, in the
order it is worth doing. Work spans two repos — GMOD/jb2hubs and
GMOD/jbrowse-components — and the commits are named on each side.

## What changed, in one paragraph

The mouse and bovine pangenomes were already built and serving from
`demos/{mouse,bovine}_pangenome/` with no build script in git and no config in
either repo. They now have both, plus a variant route for cattle, a tutorial
with four figures, and a locus catalogue that is **derived rather than curated**
— which is the part that decides whether any of this generalises past the three
datasets we happen to have.

|                                                | jb2hubs                      | jbrowse-components                    |
| ---------------------------------------------- | ---------------------------- | ------------------------------------- |
| configs on one shape, `check-pangenome-assets` | `0be8ce7f39c`                |                                       |
| builders + doc rows                            |                              | `d89f7c3025`                          |
| bovine variant route                           | `751681a6c0c`                | `94f8d5bf43`                          |
| tutorial, fixture, four specs                  |                              | `abeea38092`, trimmed in `5ad0ca9f3f` |
| derived locus catalogues                       | `04d62efa1ec`                |                                       |
| plan corrections                               | `3c07e73fc4d`, `56dcca97c91` |                                       |

## Blocking, in order

**1. The four figures are not in the store.** They render, they are reviewed,
and `website/static/img/` is gitignored, so they exist only on the machine that
made them. `check-figure-refs` is red until:

```
pnpm figures:push --exact --filter pangenome/mouse_nnt,pangenome/mouse_h2,pangenome/bovine_bola,pangenome/bovine_whole_chromosome
```

then commit `figures.lock`. Deliberately not done: it is a publish, and the
figures were worth a human look first. Regenerate with `pnpm screenshots:build`,
never `pnpm screenshots`, unless `products/jbrowse-web/build` is from today —
see `test_data/graphgenomeview/README.md` for why a stale build costs five
minutes per figure and blames the wrong thing.

**2. `mouse_h2` should be replaced, not kept.** It is a competent picture of a
locus with no finding in it, and it is on the page because H2 is what the
literature leads with — reputation, not measurement, which is the thing
`DEMO_DATASETS.md` warns against. The replacement is now derived rather than
hand-picked: `Dock2`, `chr11:34,516,044-34,560,497`, 524 segments in 44 kb, the
densest compact bubble in the mouse graph and the one window on the page where a
force layout would earn its place. Everything else there is a chain.

**3. `mouse_nnt`'s bubbles and segments lanes are clipped mid-label.** Twenty
more pixels each and a taller viewport.

## Then: the portal, which is the half still missing

`website/pangenome-config/mouse-mm39.json` and `bovine-arsucd12.json` are
committed, gated and live in the bucket, and **nothing on the website reads
either of them.** That is the orphan problem this session opened by criticising,
one level up.

Wiring them needs one type change first: **`PangenomeDataset.graphVcf` has to
become optional.** Mouse has no VCF and never will without a rebuild; cattle now
has one. The consumers are `graphVcfTrack` and `referenceLgvUrl` in
`pangenomeLinks.ts` (skip the track and its session entry when absent) and
`PangenomeLocusDashboard`, whose "browse variants" button and
`<dataPrefix>/<id>.vcfsummary.json` fetch both assume it. A derived locus has no
`.vcfsummary.json` either, so the dashboard needs a shape for "this locus has a
position and a size distribution and no callset".

After that, `pages/pangenomes/index.astro` is 529 hand-written lines that read
`PANGENOME_DATASETS` not at all. Extend the type with what the page hardcodes —
species and common name, the graph-file table, the sample-table source, the
outbound links, a `notes[]` for the coverage caveats — and loop one section
component. Doing mouse and cattle through the new component first and leaving
HPRC's section alone is the lower-risk order.

## The derived catalogue is the thing to build on

`website/generatePangenomeLoci.ts` ranks a dataset's coarse tier by segments per
bubble and names each entry from the reference annotation. Twenty loci each are
committed under `website/public/pangenome-{mouse,bovine}/loci.json`.

It was validated against human curation before being trusted, and that is the
only reason to believe it: cattle's top ten contain four of the five windows the
hand-written README beside the data calls "worth opening", and mouse's top
twelve are the Vmn2r and Speer families, Sirpb1, Dock2 and the Igh locus. Nobody
put those in a list.

Three findings in it that will bite a change:

- **`cw` cannot rank.** gfatools clamps a bubble's path count at INT32_MAX
  rather than overflowing, and every bubble at the top of the ranking is
  clamped. `cn` is the metric.
- **The gene track is per-dataset.** bosTau9 publishes no `ncbiRefSeqSelect`, so
  a hardcoded track name returns nothing and every locus reads "(intergenic)" —
  an answer, not an error. Same shape as the bug in `generatePangenomeMsa.ts`.
- **A family is named by a stem taken from every gene**, not parsed off the
  first: the first is alphabetically smallest and for a family that is usually
  the unnumbered member (`DEFB`), which a regex requiring a digit finds nothing
  in.

Worth extending rather than rewriting: HPRC has a tier too, so the same
derivation runs on it and would say how much of the curated set it recovers.
That is the honest test of whether curation is still buying anything, and it has
not been run.

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
  construction order. `minigraph --call` plus `mgutils.js merge -r0` is the
  cheap route to carriage and a VCF, hours, assemblies already on disk.
- **HPRC is a version behind here.** The tutorials moved to v2.1; this repo pins
  v2.0 across four files. Not a url edit: the committed explorer summaries are
  derived from the v2.0 VCF, so the bump has to regenerate them in the same pass
  or the charts describe one file while the launches open another.
  `check-pangenome-assets` reports the gap on every run.
- **`generate-screenshots.ts`'s `buildJbrowseWeb()` never built anything** —
  `--filter jbrowse-web` against a package named `@jbrowse/web`. Fixed, but the
  class is worth remembering: pnpm exits 0 on a filter that matches nothing.

## If you pick this up

Push the figures and commit the lock; that closes the one red check. Swap
`mouse_h2` for `Dock2` and un-clip `mouse_nnt` while the render loop is warm.
Then make `graphVcf` optional and get the two datasets into the registry — until
that lands, the portal is still HPRC-only and the two configs are decoration.
