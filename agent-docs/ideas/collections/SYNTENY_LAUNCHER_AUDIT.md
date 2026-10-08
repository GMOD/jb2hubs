---
name: synteny-launcher-audit
description:
  What the 2026-10-08 audit of /synteny measured on the hosted main build and
  what it left unbuilt: a whole-genome entry point, N-panel stacks, a
  multi-way mode, superseded builds, catalog pages.
---

# The synteny launcher, audited

Measured 2026-10-08 with puppeteer on ada against genomes.jbrowse.org and
https://jbrowse.org/code/jb2/main, reading `JBrowseRootModel` back. The defects
it found landed the same day (git holds them); this file keeps the numbers and
the ideas. The view-level findings from 2026-09-19 are in `SYNTENY_UX_REVIEW.md`
and still stand except where noted.

## What a launch costs

| launch                                 | ready | notes                                  |
| -------------------------------------- | ----- | -------------------------------------- |
| two UCSC panels at a gene (hg38, mm39) | 3.4 s | merge API 2 s warm, 6.5 s cold, 2.3 MB |
| two GenArk panels at a gene            | 1.0 s | 10 hgdownload requests for sidecars    |
| six panels at TP53 (rat … dog)         | 3.5 s | 1.3 KB url, every panel on its gene    |
| whole-genome ribbons, hg38 × mm39      | 2.5 s | 711 × 61 regions, a hairball           |
| whole-genome dotplot, 100 kb floor     | 8.9 s | 24 × 21 chromosomes, clean             |
| whole-genome circular, 1 Mb floor      | 3.0 s | 45 regions, legible                    |
| the hg38 star at TP53, 26 lanes        | 14 s  | staging only                           |

The catalog asset loads in 0.9 s and an ortholog resolves in about 1 s.

## A whole-genome entry point

The whole-genome ribbon launch is the one picture on the page nobody can read.
Three launches over the same merged config and liftOver track are, and none
needs a derived file:

- **Dotplot**,
  `{type:'DotplotView', views:[{assembly, displayedRegionNames}, …], tracks, minAlignmentLength: 100000}`:
  the classic human–mouse figure. At 1 Mb it looks the same and opens in 3 s.
  Without the floor the short chains bury the diagonals.
- **Circular**,
  `{type:'CircularView', assembly:[a, b], displayedRegionNames: {a: […], b: […]}, tracks, minAlignmentLength: 1000000, autoDiagonalize}`.
  This overturns the circos note in `SYNTENY_UX_REVIEW.md`: `minAlignmentLength`
  is applied at launch on `main`, so the full PIF draws as a few hundred chords.
- **Ribbons narrowed to the main chromosomes** with `minAlignmentLength: 100000`
  and no gene tracks read as chromosome-painted bands.

Two caveats. Every form needs the chromosome list: a GenArk pair opened the
dotplot over 29,886 × 1,958 regions and showed nothing, so the list has to come
from the sidecar (`chrom.sizes` above a length, or the `chr` names in
`chromAlias`). And none of the three keys exists on released v4.3.0, which reads
only `assembly` and `tracks` for these views.

## N-panel stacks on /synteny

A six-panel stack boots in 3.5 s from the same `syntenyViewUrl`, so an "add an
assembly" control is a url change: each added panel needs a chain to its
neighbour, hg38 has 302 partners, and the gene page's `MultiSyntenyPicker`
already plans such chains. Send one track array per level, since `main` puts a
flat list on level 0 only, and put the spec in the url hash (`#session=spec-…`),
which `main` reads and no request-line limit touches.

Do not send `sameScale: true` until the hosted build carries the fix on the
`synteny-row-grow` branch of jbrowse-components: today it zooms every row to the
coarsest row's whole-chromosome fit (97,641 bp/px on the TP53 pair). The same
branch passes `grow` and `showHitTrack` through for synteny rows, which is what
let a GenArk panel open two RefSeq tracks.

## A multi-way mode

207 anchors have three or more liftOver mates (163 UCSC dbs, 44 GenArk hubs);
hg38 has 180 mates across 102 species, mm39 76 across 47. The star track exists
in every such `config-staging.json`, with a lane picker, drag and freeze, and a
"Linear synteny view (visible region)" drill-down back to a pairwise stack. A
"one versus many" mode on /synteny is: pick the anchor, pick lanes (the featured
list by default), optional gene, launch the LGV with `rows: { kept, domain }`.
Staging until core v5. No unanchored N-way view exists upstream; the stack is
the nearest thing.

## Superseded builds

106 of the 654 listed assemblies are UCSC builds a newer db of the same organism
supersedes, and 932 of the 1,614 pairs touch one. Ranking now puts the newest
build first; hiding the rest behind a "current builds" toggle, in place of the
UCSC/GenArk sources toggle, would halve the lists. 353 assemblies have exactly
one partner (129 of them hg38), which the picker now fills in.

## Smaller

- `/synteny/info` is two counts. One static page per assembly listing its
  partners would make the catalog searchable and give the accession page a real
  target.
- The ortholog table's two-panel launch passes no colour mode; `/synteny` paints
  by query chromosome.
- A `[rev]` loc works on `main` (measured on the TP53 pair: the reversed panel
  lands on Trp53 with parallel ribbons). An earlier reading of the reversed
  row's offset as a forward coordinate said otherwise.
