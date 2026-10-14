---
name: staged-config-features
description:
  multiwayStar and the RepeatMasker multi-row display are staged only. The
  hosted site runs main, so promoting them is now a call about what pinned v4
  hosts lose.
---

# Staged config features

Each of these lives only in `config-staging.json` (or behind a staging flag),
because a display type an old host lacks is fatal once its track opens.
genomes.jbrowse.org launches jbrowse-components `main` (stated 2026-10-14), so
no release has to ship before one reaches `config.json`. What is left is the
call: a pinned v4 host or old Desktop install that opens the track errors.
`pnpm check-config-compat` proves the config still boots there, and
`pnpm check-display-types` names the display types the floor lacks; neither
makes that track work.

- **`multiwayStar`** (`website/src/config/features.ts`): only
  `config-staging.json` carries the multi-way synteny star.
  `ucsc2jbrowse/src/buildConfigs.ts` writes one over every liftOver PIF the
  anchor's config names (`multiwayStarTrack.ts`, 165 of the 238 UCSC configs),
  opening on the anchor's multiz `speciesDefaultOn`. The display fetches only
  the lanes it draws from jbrowse-components `64199e02e9` on; a `jb2/main` built
  before it reads every child on every window, 240 for hg38. Deploy `jb2/main`
  before uploading these siblings.
- **The RepeatMasker split-by-class display** (`repeatClassDisplay: true` in
  `stagingEnhanceOptions`, `hubtools/src/repeatClassDisplay.ts`). Promoting it
  means deleting the gate and calling `addRepeatClassDisplay` unconditionally.

## Which release carries a display

A pinned v4 host still opens these configs, so the question of which release
first carries a display still decides what those hosts lose.
`check-config-compat` cannot answer it, because the fatal needs the track
opened. A jbrowse-components checkout answers outright:

```
git ls-remote --tags origin | grep -o 'v[0-9]*\.[0-9]*\.[0-9]*$' | sort -V | tail -1
git cat-file -e <newest-tag>:plugins/canvas/src/LinearMultiRowFeatureDisplay/model.ts
```

Use `ls-remote`, not local tags: a checkout that has not fetched in a while
reports "no release yet" forever. On 2026-10-14 the newest tag was
`v5.0.0-beta.13`; the newest release, `v4.3.0` (2026-05-21), predates both
`LinearMultiSampleVariantDisplay` (2026-06-03) and
`LinearMultiRowFeatureDisplay` (2026-06-20).

## GenArk is not staged at all

`addRepeatClassDisplay` handles a GenArk `-repeatMasker` track too (the class
comes off the name suffix `L1HS#LINE/L1` through a jexl `rows.field`), and it
matches about 16% of GenArk configs. Nothing sets `RMSK_MULTIROW_DISPLAY` for
the GenArk pipeline, so that branch is tested rather than live, and
`hubtools/src/enhanceConfig.test.ts` pins the production pass leaving the track
displayless.

A GenArk `config.json` is the production file at a permanent url that pinned v4
hosts and old Desktop installs read, and there is no GenArk sibling to stage in.
Turning the branch on writes the display into that file directly, so it is the
same compat call as promoting the UCSC display, made over 52,000 configs.

A staging-only route has to be kept out of the production sitemap when one is
next added; `website/astro.config.mjs` dropped its `STAGING_ONLY` list with the
last entry.
