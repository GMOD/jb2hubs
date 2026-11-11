---
name: synteny-launch-measurements
description:
  What a synteny launch costs, how long its url runs, and what cigarMode and the
  opacity options do to the ribbons, and where the follow places a panel NCBI
  cannot, measured on 2026-09-19, 2026-10-08 and 2026-10-15.
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
- **The /synteny launch leaves one shared scale off.** As `sameScale` (now
  `coord: { ratio: 1 }`) it zoomed both TP53 panels out to whole chromosomes on
  2026-10-08.
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

## Placing a panel by the alignment

`placePanels` (`website/src/components/panelPlacement.ts`) leaves a panel NCBI
cannot place to `navigation.follow` on `main`. Human HBB has no NCBI ortholog in
mouse, and NCBI places rat's Hbb-b1 on GRCr8 but not rn7. Boots of the /synteny
launch on 2026-10-15:

| pair, gene               | anchor             | row placed by follow, settled            |
| ------------------------ | ------------------ | ---------------------------------------- |
| hg38 × mm39, HBB         | hg38 202 kb window | mm39 chr7:103,415,992..103,552,567, 10 s |
| hg38 × rn7, HBB          | hg38 202 kb window | rn7 chr1:158,160,845..158,344,235, 14 s  |
| mm39 × hg38, HBB swapped | hg38 window, row 2 | mm39 chr7:102,885,505..103,546,070, 14 s |

- **`main` reads the follow as `navigation: { follow, anchor }` since
  2026-10-22** (jbrowse-components c7fd681), and the follow no longer flips a
  row (5424c4c). Until the 2026-11-05 fix every launch that relied on it sent
  `followSynteny`, `followAnchorIndex` and `followMatchOrientation`, which
  `main` drops with an unknown-key warning, so the partner opened on its whole
  genome. Boots on 2026-11-05 with `navigation`, read back 15 s after the rows
  initialized:

  | pair, gene            | row placed by follow                          |
  | --------------------- | --------------------------------------------- |
  | hg38 × mm39, HBB      | mm39 chr7:103,415,945..103,552,520            |
  | hg38 × danRer11, PAX6 | danRer11 chr25:14,986,346..15,057,524 (pax6a) |

  NCBI places zebrafish genes on GRCz12 only, so every danRer11 partner panel is
  a follow.

- **Follow moves a row NCBI placed too.** With follow on, the TP53 mouse row
  moved about 16 kb off its NCBI window, so a pair NCBI placed on both panels
  launches without follow.
- **An anchor on the whole genome breaks follow:** the other row spreads over a
  dozen chromosomes and reports `approximate`, so a launch with no anchor turns
  follow off.
- **A bare-symbol anchor works.** hg38 `loc: "HBB"` lands on the 2 kb gene, and
  mouse follows to chr7:103,461,331..103,463,440 (Hbb-bt).
- **JBrowse shows what placed a row:** its Follow toggle is on, and the anchor
  row carries an "Anchor" badge.

## The gene-order star

`/conserved-gene-order` opens its gene with `geneOrderStarUrl`
(`website/src/components/geneOrderStar.ts`): hg38 with a session
MultiWaySyntenyDisplay over `STAR_PANELS.hg38`, twelve genomes each placed by
its liftOver chain. Branch-point stacks used to open from the tree, but 0 of
HBB's 40 levels had a chain, and the configured star took its lanes from the
figure's rows, which for HBB left only orangutan.
`pnpm check-gene-order-launches` boots the launch and fails a lane that lands
off its gene. Boots on 2026-10-15:

| gene | url            | settled | lanes off the gene                        |
| ---- | -------------- | ------- | ----------------------------------------- |
| HBB  | 7.1 KB in hash | 2.3 s   | opossum draws no genes                    |
| TP53 | 7.1 KB in hash | 2.3 s   | chicken's chain lane sat on chr9:17.25 Mb |

- **A reference other than hg38 opens its star's species** (`speciesPanel`): one
  lane per species in `synteny_stars.json`'s `taxa`, never another build of the
  reference's own species, twelve of them spread over the rings of kinship
  around the reference (`spreadOverRings`, the figure's trim rule). The page's
  species in tree order, tried first, gave mouse Hbb-bt twelve lanes of primates
  and squirrels with no rat. A species the page's tree lacks, since NCBI lists
  no ortholog in it, is in a last ring, model organisms first: 27 of mm39's 46
  for Hbb-bt, rat among them. Booted 2026-11-11 on main, every lane on its gene:
  mouse Trp53 3.2 s (Mus caroli, rat, squirrel, pika, human, cow, elephant,
  opossum, platypus, frog, then chicken and zebrafish by NCBI), mouse Hbb-bt 4.3
  s, fly dpp 2.2 s. Zebrafish tp53 still gets no link; the cause was not traced
  (the launch needs the reference gene placed on an assembly that is a UCSC db,
  and NCBI's zebrafish reference is no longer danRer11's). Until 2026-11-11 only
  hg38 had a link, since `STAR_PANELS` has one key.
- **A star track needs two lanes.** MultiPairwiseSyntenyAdapter reads its anchor
  as the one assembly every child names, and one child names two: the track
  shows `NoCommonAssemblyError` in place of its lane. So where NCBI places the
  gene in only one of chicken and zebrafish, all lanes share one track, "Placed
  by whole-genome alignment or NCBI orthologs". Mouse Trp53 met it on
  2026-11-11, under a panel that held zebrafish and not chicken.
- **`geneOrderStarUrl` puts the display in the launch's session**, so the launch
  needs no star in the reference's `config.json`.
- **gorGor6 put HBB and TP53 on unplaced scaffolds**, so gorilla is the T2T
  build, GCF_029281585.2.
- **The reference lane needs `laneGeneTracks`.** Without it hg38's lane draws
  its first annotation track and labels HBB "CCDS7753.1-gene".
- **Chicken and zebrafish lanes come from NCBI where NCBI places the gene**
  (`NCBI_FIRST`): one PAF record per ortholog pair on the gene's own sequence,
  in a `data:` uri, in a second track named "Placed by NCBI orthologs". For TP53
  chicken's GRCg7b lane lands on NW_024096016.1, TP53, and zebrafish's on
  NC_141025.1:25.13 Mb, tp53, and the launch still settles in 2.3 s. A `data:`
  uri is not a documented JBrowse location; it works because jbrowse-web fetches
  it.
