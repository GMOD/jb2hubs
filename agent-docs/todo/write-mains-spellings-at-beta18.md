---
name: write-mains-spellings-at-beta18
description:
  The configs still write display settings beta.17 reads and main has retired
  (mouseover, MultiLinearWiggleDisplay, jexlFilters, rows.domain,
  showRowSeparators, the view's init). Respell them all in one pass once
  v5.0.0-beta.18 is tagged and hosted, then bump HOST_VERSIONS.
metadata:
  category: ready
  area: hubtools
  first_move:
    "Once jbrowse.org/code/jb2/v5.0.0-beta.18/ answers, run main's `jbrowse
    validate` over a regenerated hg38 config.json and respell every legacy-key
    warning."
  order: 1
---

# Write main's spellings once beta.18 ships

The configs target the newest v5 tag and `main` (ADR 0002, 2026-10-26
amendment). beta.17 predates most of jbrowse-components' Vega-Lite respell, so
the generators still write the spellings beta.17 reads, and `main` lifts them.
Respelling before beta.18 is hosted would cost beta.17 those settings;
respelling twice (to beta.17's words, then main's) is wasted work.

## The pass

1. Set `HOST_VERSIONS` in `scripts/checkConfigCompat.mjs` to
   `['v5.0.0-beta.18', 'main']`.
2. Regenerate hg38 and a GenArk hub, then run main's validator over each:
   `node --experimental-strip-types products/jbrowse-cli/src/bin.ts validate <config.json>`
   from a jbrowse-components checkout at the tag.
3. Respell every `legacy key` warning at its generator. Measured on the hosted
   hg38 config on 2026-10-26:

   | Count on hg38 | Written                                        | Generator                                      |
   | ------------- | ---------------------------------------------- | ---------------------------------------------- |
   | 176           | `mouseover` on `LinearBasicDisplay`            | `hubtools/src/featureDisplay.ts`, `ncbiGff.ts` |
   | 137           | `MultiLinearWiggleDisplay`, `defaultRendering` | `ucsc2jbrowse/src/mergeMultiWigTracks.ts`      |
   | 10            | `jexlFilters`                                  | `hubtools/src/featureDisplay.ts`               |
   | 1             | the view's `init` wrapper                      | the default-session generator                  |

   The RepeatMasker display (`hubtools/src/repeatClassDisplay.ts`) writes
   `rows.domain` beside `rows.sort`, and `showRowSeparators`: beta.17 reads
   `rows.domain` and `showRowSeparators`, and main reads `rows.sort` and lifts
   the separator flag.

   Two writers already write main's spellings, against the rule above, and both
   reach `config.json`. Respell each to beta.17's words now, or accept the loss
   until beta.18:
   - **`repeatClassDisplay.ts`'s `rowColor.scale`** (since 94a95f8711e1):
     beta.17's `rowColor` declares no `scale`, so beta.17 draws the classes
     without their colors. Main still lifts the flat
     `rowColor: {domain, range}`, which both hosts read.
   - **`hubtools/src/alfaPopulations.ts`** (`hg38-ALFA_populations`): beta.17
     declares no display-level `encoding.y.scale`, so its 0–1 axis is lost, and
     `marks[].encoding.color.scale` is an object where beta.17 has a
     single-value setting, which may fail the display when the track opens.
     Unverified: open the track on `jbrowse.org/code/jb2/v5.0.0-beta.17/`.
     `check-config-compat` opens no track, so it cannot see either.

4. Rename `derivedDisplay.ts`'s path lists with the keys, since a derived key
   decides what a hand-authored display keeps.
5. Promote nothing else in the same pass: a display type `main` added after the
   tag still waits for its own release (`pnpm check-display-types`).

## The Trix keys are a separate change

`textSearchAdapterId` and `metaFilePath` are not slots on any v5 host, and
main's validator reports both as errors. Dropping them needs
`aws/config-merger/src/merger.ts` to dedupe text-search adapters by `ixFilePath`
first, deployed before any config without the id is uploaded: it keys on the id
today, and an adapter without one collapses the merged list to a single entry.
`scripts/formatConfigs.ts`' `restoreTrixAdapters` then goes.
