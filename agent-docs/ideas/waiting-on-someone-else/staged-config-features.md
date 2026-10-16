---
name: staged-config-features
description:
  multiwayStar, the RepeatMasker multi-row display and the ALFA populations
  track stay in config-staging.json until jbrowse-components v5.0.0 is released,
  because every Desktop install until then fails when it opens any of them.
---

# Staged config features

Each of these lives only in `config-staging.json` (or behind a staging flag).
When a v4 host opens a track whose `displays[]` names a type it lacks, the MST
union rejects the track config and the app shows a fatal error (measured
2026-08-09 on v4.0.0 and v4.3.0 with `LinearMultiRowFeatureDisplay` on
`hg38-rmsk`).

genomes.jbrowse.org launches jbrowse-components `main` (stated 2026-10-14), but
that does not decide these two. JBrowse Desktop reads the same permanent
`config.json` url, and every Desktop install is v4.x until Desktop 5 ships. A v4
host drops an unknown config key, but it has no way to drop a display it lacks.
Promote both when v5.0.0 is released, after `pnpm check-config-compat` and
`pnpm check-display-types` (decided 2026-10-14).

- **`multiwayStar`** (`website/src/config/features.ts`): only
  `config-staging.json` carries the multi-way synteny star.
  `ucsc2jbrowse/src/buildConfigs.ts` writes one over every liftOver PIF the
  anchor's config names (`multiwayStarTrack.ts`, 165 of the 238 UCSC configs),
  opening on the anchor's multiz `speciesDefaultOn`. The display fetches only
  the lanes it draws from jbrowse-components `64199e02e9` on; a `jb2/main` built
  before it reads every child on every window, 240 for hg38. Deploy `jb2/main`
  before uploading these siblings.
- **The ALFA populations track** (`hubtools/src/alfaPopulations.ts`, hg38
  only): one `LinearMarkDisplay` scatter of ALT allele frequency over NCBI's 12
  per-population bigBeds, read through a `MultiWiggleAdapter`. A v4 host fails
  the whole session when it opens the track (measured 2026-10-16 on v4.3.0).
  The bigBeds are about 19 GB each and range-read from NCBI, and the display
  raises `fetchSizeLimit` to 30 MB, so about 8 kb is comfortable. The URLs name
  NCBI's dated release `20260205170148`, and a new release means a new
  `ALFA_RELEASE`.
- **The RepeatMasker split-by-class display** (`repeatClassDisplay: true` in
  `stagingEnhanceOptions`, `hubtools/src/repeatClassDisplay.ts`). Promoting it
  means deleting the gate and calling `addRepeatClassDisplay` unconditionally.

## Which release carries a display

`check-config-compat` cannot say whether a release carries a display, because
the failure needs the track opened. A jbrowse-components checkout can:

```
git ls-remote --tags origin | grep -o 'v[0-9]*\.[0-9]*\.[0-9]*$' | sort -V | tail -1
git cat-file -e <newest-tag>:plugins/canvas/src/LinearMultiRowFeatureDisplay/model.ts
```

Ask the remote with `ls-remote`, because a checkout that has not fetched in a
while reports "no release yet" forever. On 2026-10-14 the newest tag was
`v5.0.0-beta.13`; the newest release, `v4.3.0` (2026-05-21), predates both
`LinearMultiSampleVariantDisplay` (2026-06-03) and
`LinearMultiRowFeatureDisplay` (2026-06-20).

## GenArk is not staged at all

`addRepeatClassDisplay` handles a GenArk `-repeatMasker` track too (the class
comes off the name suffix `L1HS#LINE/L1` through a jexl `rows.field`), and it
matches about 16% of GenArk configs. Nothing sets `RMSK_MULTIROW_DISPLAY` for
the GenArk pipeline, so only tests run that branch, and
`hubtools/src/enhanceConfig.test.ts` pins the production pass leaving the track
displayless.

A GenArk `config.json` is the production file at a permanent url that pinned v4
hosts and old Desktop installs read, and there is no GenArk sibling to stage in.
Turning the branch on writes the display into that file directly, so it waits on
the same release as the UCSC display and then reaches 52,000 configs at once.

A staging-only route has to be kept out of the production sitemap when one is
next added; `website/astro.config.mjs` dropped its `STAGING_ONLY` list with the
last entry.
