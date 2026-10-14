---
name: synteny-launch-measurements
description:
  What a synteny launch costs, how long its url runs, and what cigarMode and the
  opacity options do to the ribbons, measured on 2026-09-19 and 2026-10-08.
---

# Synteny launches, measured

The launch builders are `website/src/components/jbrowseLinks.ts` and the callers
of `syntenyViewUrl`. The open proposals these numbers size are in
`agent-docs/ideas/collections/synteny-launcher.md` and
`agent-docs/ideas/waiting-on-someone-else/synteny-upstream-asks.md`.

## What a launch costs

Measured 2026-10-08 with puppeteer on ada against genomes.jbrowse.org and
https://jbrowse.org/code/jb2/main, reading `JBrowseRootModel` back.

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

- **`minAlignmentLength` applies at launch on `main`**, so a full liftOver PIF
  draws as a few hundred chords in a `CircularView`. Released v4.3.0 reads only
  `assembly` and `tracks` for the dotplot and circular views.
- **A whole-genome view needs a chromosome list.** A GenArk pair opened the
  dotplot over 29,886 × 1,958 regions and showed nothing.
- **A `[rev]` loc works on `main`**: on the TP53 pair the reversed panel opens
  on Trp53 with parallel ribbons.

## Url length

Measured 2026-09-19: a two-panel row link is ~580 characters, a seven-genome
stack ~1,750 and a 13-panel stack ~2,900–3,100. `desktopUrl` roughly doubles
whichever one it wraps. The merge API's absolute url is 91 encoded characters
before any hubIds, 16% of a two-panel link; `?config=` resolves against
jbrowse.org, so a site-relative path would cost a handful. `specUrl` moves its
params into the hash past `MAX_QUERY_URL_BYTES`.

Three shortenings do not work:

- **`session=encoded-`** is the only compressed prefix jbrowse-web accepts, and
  it holds a whole session snapshot, which for a three-key spec grows by more
  than deflate saves. jbrowse-web has no compressed `spec-`.
- **share.jbrowse.org** mints a new id and password per call, so each
  regeneration of the site would replace every link with a new one.
- **A config `defaultSession`** cannot hold a locus: `extendSession` with `loc`
  applies only to the default session's first `LinearGenomeView`.

## cigarMode

Measured 2026-09-19 against `hg38ToMm39.over.pif.gz`, fine tier, two windows
pulled by tabix and run through a port of `visitCigarRenderedSegments`.
Interactive comparison on the real geometry:
<https://claude.ai/artifact/9evhTGBB6VmY1rUKtkNHc4>

- **Sub-pixel operations are not drawn.** `MIN_INDEL_PX = 1` merges any indel
  narrower than a pixel into the surrounding match. At 200 bp/px the HOXA
  window's 7,649 CIGAR operations become 693 drawn segments, 58 of them indels.
  A deletion of exactly 1.0 px also merges (both comparisons are strict), and
  the gate measures the axis the op consumes, not the ribbon's thickness.
- **`'matches'` costs the deletion fraction.** It draws one tile per match
  segment instead of the full-span trapezoid:

  | window       | match fraction of span | ink vs `off` |
  | ------------ | ---------------------- | ------------ |
  | HOXA cluster | 71.2%                  | 0.77×        |
  | BRCA1        | 24.0%                  | 0.24×        |

- **A feature under `MIN_CIGAR_PX_WIDTH = 2` keeps its solid base** even in
  `'matches'`. BRCA1 goes 0.24× → 0.25× at 200 bp/px (10 of 18 blocks untiled,
  1% of the ink) and 0.38× → 0.53× at 2000 bp/px (16 of 18 untiled), while
  HOXA's ink stays the same. The mode therefore costs most at the scale the
  launches open at.
- **Tiles fade by `min(perpW, 1)` with no floor**; 30% of BRCA1's tiles are
  sub-pixel at 400 bp/px. `bucketBpPerPx` reuses geometry across a 2× zoom
  range, so 7% of HOXA's indel quads fall under 1 px after a zoom-out inside the
  same bucket.

## Ribbon opacity

| option                   | default                | exposed in                         |
| ------------------------ | ---------------------- | ---------------------------------- |
| `alpha`                  | `0.2`                  | settings slider, cubic 0–1         |
| `opacityByIdentity`      | `false`                | settings checkbox, "Identity fade" |
| `fadeThinAlignmentsMode` | `'auto'`               | no menu, snapshot only             |
| tile fade `min(perpW,1)` | always on in `matches` | none, no floor                     |
| `WIDTH_FADE_FLOOR`       | `0.15`                 | constant                           |
| marker alpha             | fixed byte 64          | none                               |
| `minAlignmentLength`     | `0`                    | settings slider                    |

`opacityByIdentity` is the only data-driven option. It floors at 30%, skips
indel quads, and needs an identity the adapter can produce: for a liftOver PIF
the `de` tag, which the fine tier has and the coarse tier lacks.
