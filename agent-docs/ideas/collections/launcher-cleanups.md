---
name: launcher-cleanups
description:
  Website refactors left from the 2026-11-02 and 2026-11-08 reviews, each
  confirmed present on 2026-11-18: one LinearSyntenyView builder, one star
  launcher, gene-centred /synteny examples, a compact synteny asset, shared
  launch helpers, dead picker paths, stale comments, leftover memo hooks.
---

# Launcher refactors and cleanups

Each item was confirmed still present on 2026-11-18. Functions are named rather
than lines, because the lines move. Pangenome code consolidates into pangenome
modules, never generic helpers.

## Launchers

- **One `LinearSyntenyView` builder through `placePanels`.** /synteny follows
  but highlights nothing, `pairwiseOrthologUrl` (`orthologLaunches.ts`)
  highlights but never follows, and `buildMultiSyntenyUrl` drops query
  colouring. One builder also gives an unplaced reference panel `followSynteny`
  instead of the whole genome, and one flip rule (`strandFlips` anchors on
  `rows[0]`).
- **One star launcher.** Keep `geneOrderStarUrl`'s session tracks and NCBI-first
  lanes, pass it the ticked rows, and drop `starUrl` and the staging-config
  dependency (`multiSyntenyDrilldown.ts`, `OrthologLaunchBar.tsx`). Then
  `syntenyCandidates`/`planFromSelection` (`multiSyntenyPicker.ts`) are dead, as
  is the pre-names `PairEntry` handling in `syntenyPairIndex.ts`.
- **Gene-centred `/synteny` examples** (`lib/syntenyExamples.ts`): two of three
  open the whole-genome hairball. With no gene, open at `defaultPos` with
  follow, or a dotplot (`ideas/collections/synteny-launcher.md`).
- **`/synteny`'s primary button ignores the Desktop preference**
  (`SyntenySelector.tsx`); use `LaunchLink`.
- **The pangenome graph launch inlines a second `VariantTrack`** over the VCF
  the graph config already has (`pangenomeLinks.ts`); move its settings to the
  config track and name it by id (~2 KB a url). `rows.kept` repeats `rows.sort`
  (~9 KB on chrX); test dropping it with `check-pangenome-launches`.
- **A compact `[trackId, a, b]` synteny asset** (~42 KB gzipped) instead of
  `syntenyTracks.json` (79 KB gzipped, 71 duplicate ids, names unread).

## Helpers

- One gene-track rule for `accessionToJbrowseUrl` and `buildMultiSyntenyUrl`
  (`orthologLaunches.ts`); `geneHighlight` returning a string; rename one of the
  two `geneWindow`s (`orthologLaunches.ts`, `geneSearch.ts`); `wholeSequence`
  through `placeRegion` (`pangenomeRegion.ts`); `regionLaunches` taking the
  `Reading` (`pangenomeLinks.ts`).
- `/gene` and the protein browser still suggest symbols through mygene.info
  (`taxonSymbols`, `geneSearch.ts`); the pangenome pages read the reference's
  own trix and GFF.
- `PangenomeRegionBox.tsx` replaces a failure with a new `Error`
  (`deadlineMessage`); keep the original and format at render.
- Stale comments: `ucscDefaultTracks.ts` says hg38's config is 30 MB (1.52),
  `genomeTarget.ts` says minimal is 7 KB (60).

## Take when touching the file

- 19 `useMemo`/`useCallback` calls left in eight components under the React
  Compiler. Remove each only where the compiler is confirmed to compile that
  component. `SyntenySelector.tsx`'s `queryGeneOptions` callback is
  load-bearing: `Autocomplete` asks again whenever its identity changes.
