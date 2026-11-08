---
name: website-refactors
description:
  The larger website refactors left from the 2026-11-08 eight-agent review of
  website/ and its last 300 commits. The bugs it found have landed; what is left
  is the structural work, ranked, each with the files to start at, the trap to
  respect and the check that proves it.
---

# Website refactors left from the 2026-11-08 review

Eight read-only reviewers covered pangenome UI, pangenome data, protein browser,
synteny and gene order, gene and orthologs, the core pages, cross-cutting code,
and the history of the last 300 commits touching `website/`. The bugs they found
landed in `9af3a6a12fa8`..`8a1009be3432`. The HPRC walk file was renamed `-f7`
in `b9f1d86d7994`, and every dependency went to its latest release in
`9642213e61f4`. The pangenome items landed in `808f72c9dccb`..`5f291e6bddbf` and
the first two remounts in `222aa8acb066`; everything below is unstarted.

Functions are named rather than line numbers, because the lines move. Confirm
each one still exists before starting it.

## How to work it

- Use one worktree branch per item, landing on main as a fast-forward. Run
  tests, typecheck, lint and the launch checks on ada (memory: `run-on-ada`),
  and run only the touched files' tests while iterating.
- A subagent brief must repeat the CLAUDE.md test rule: keep runs small, and run
  the full suite and typecheck once at the end.
- The user values dedicated pangenome modules. Consolidate pangenome code into
  pangenome files, never into generic helpers.
- Use `key` remounts or React 19 form actions in place of hand-written resets
  (memory: `react-forms-no-manual-reset`).

## Pangenome

- **The next `buildHprcGenes.sh` run rebuilds the HPRC gene models** (about 20
  minutes on ada): its `CONVERTER_HASH` names the moved paths and
  `pangenomeGff3.ts`. Only a CAT or Liftoff value with a `%XX` escape can come
  out different.
- **Not needed:** making per-dataset branching data-driven. No `dataset.id` if
  chains exist.

## Cross-cutting

- **One JBrowse url module.** Launch urls are built in five places:
  - `src/config/jbrowse.ts` and `src/components/jbrowseLinks.ts`;
  - `proteinSession.ts`, which hand-builds `#config=…&session=encoded-…`;
  - `src/lib/ucscLaunch.ts` and `orthologSearchUtils.ts`, which each concatenate
    `&assembly=&loc=&tracks=`.

  "The UCSC config if the genome has one, else GenArk's" is written in at least
  five places (`SearchPage.tsx`, `accession/[id].astro`,
  `orthologSearchUtils.ts` twice, `geneHub.ts`, `GenePage.tsx`,
  `geneOrderStar.ts`, `genomeTarget.ts`). Build one module exporting
  `jbrowseUrl(config, {assembly, loc, tracks, highlight})`, `encodedSessionUrl`,
  and a launch name and gene track over `{accession, ucscDb?, geneTrack?}`.
  - Change `accessionToJbrowseUrl` to take that object instead of four
    positional arguments.
  - **Fix inside this one:** `genarkConfigPath` (`src/config/jbrowse.ts`)
    hand-codes hubtools' `hubPath` sharding; `a19843bc8104` converted the other
    callers and missed it. Export `hubPath` through a hubtools subpath, as
    `hubtools/commonName` already is.
  - **Check:** `jbrowse.test.ts`, `jbrowseLinks.test.ts`, `ucscLaunch.test.ts`,
    `desktopLinks.test.ts`, and the protein and gene-order launch checks.

- **Remount instead of hand-written resets:**
  - Species lookup: `GeneQueryForm.tsx` (`latestRequest`, `refPending`,
    `refError`) and `ProteinBrowser.tsx` (`latestSubmit`, `species`) each track
    stale answers by hand. A shared `useSpeciesResolution` hook replaces both.
  - **Trap:** keep the species input uncontrolled and don't use `<form action>`,
    because React would wipe a mistyped name after a failed action.
    `syncProteinUrl` needs the resolved taxon at submit time.
- **No data-fetching effects.** `Autocomplete.tsx` and `GeneCombobox.tsx` each
  hand-roll a 220 ms debounce with an ignore flag, the site's only fetching
  effects. A `useDebouncedValue` plus `useSWRImmutable` (used in 14 other files)
  removes both.
  - **Trap:** `SyntenySelector.tsx`'s memoised `queryOptions` is load-bearing,
    because `Autocomplete` re-queries whenever its identity changes.
- **CSS:**
  - The listbox is styled three times, with drifted z-index, padding and font
    size: `.autocomplete-*` in `Autocomplete.css`, `.ui-listbox`/`.ui-option` in
    `ui.css`, and `.header-search-option` in `headerSearch.css`.
  - Page-level `<style is:global>` blocks break `ui.css`'s own stated rule:
    about 310 lines in `protein-browser.astro`, plus
    `conserved-gene-order.astro` and `synteny/index.astro`. Move each to a
    stylesheet its component imports, and rename the protein page's borrowed
    `msv-` classes.
  - Needs a visual check on ada (memory: `run-on-ada`, the dev-server and
    puppeteer notes).
- **Split `orthologSearchUtils.ts`.** It is 688 lines, and the page it was named
  for is gone. Split it into three files:
  - `referenceSpecies.ts`: `COMMON_SPECIES` through `geneUrl`.
  - `orthologResults.ts`: the row building and the TSV.
  - `orthologLaunches.ts`: the launch urls, plus `syntenyLinks` from
    `OrthologResultsTable.tsx`.

  This pairs with the url module above. Move `geneHub.ts`'s gene-order trimmer
  (`trimNeighborhood` and its helpers) beside `neighborhood.ts`.

- **Accession page logic out of frontmatter.** `accession/[id].astro` builds its
  `getStaticPaths` props inline and declares no `Props`, and frontmatter is not
  typechecked.
  - Add an `accessionPagePaths()` in `accessionData.ts`, typed with
    `satisfies Props` as `ucsc/[id].astro` already does.
  - Build the "More about" rows as a list in TS, so `hasAssemblyDetails` can't
    drift from them.
  - `buildSiblingIndex` sorts each taxon's group once per member. Sort each
    group once.
- **One type and one reader per pipeline input.** The `processedHubJson` record
  is declared four times: `AssemblyData`, `HubSource`, `HubRecord` in
  `generateSearchIndex.ts`, and `HubMetadata`. `list.json` is declared twice,
  once as `any`. The ortholog index shape is declared four times; have the
  writer use `satisfies AssemblyIndex`.
- **One canonical-to-translation helper.** `seedWindow` (`proteinAlignments.ts`)
  copies `onTranslation` (`proteinLaunch.ts`). Both pass canonical numbers
  through unchanged when the canonical sequence is missing, which is the
  mis-numbering their comments warn about; `residueConsequences` maps the other
  way by hand. Export `toTranslation` and `toCanonical` from `focus.ts`,
  returning undefined when a sequence is missing.
  - **Check:** `pnpm check-protein-launches` (CLAUDE.md requires it).
- **Catch JBrowse `main` renames automatically.** About 16 commits this period
  chased renamed config spellings by hand. Make `check-pangenome-launches` and
  `check-config-compat`'s `main` host fail when `main` logs that it lifted a
  legacy key. Keep `pangenomeDataset.ts` to intent and let `graphVcfTrack`
  (`pangenomeLinks.ts`) be the only writer of JBrowse spellings. The bovine row
  settings are duplicated in `pangenomeDataset.ts` and `bovine-arsucd12.json`.
- **GenArk's discarded star track.** `buildConfigsBatch.ts` builds a
  `withMultiwayStar(...)` track that `withoutV5Only` removes at once, and GenArk
  writes no staging sibling to keep it. Drop the call and its test, or record
  that it waits on the v4.3.0 drop, which is Colin's call.
- **Gene-order lane pitch.** `geneOrderStar.ts`'s `LANE_PITCH = 36` should be 34
  by hubtools' constants, and `multiSyntenyDrilldown.ts`'s 50 copies
  `starLanePitch(true)`. Derive both from hubtools; check that importing
  hubtools from a client island tree-shakes. Moving `starUrl` beside
  `multiWayDisplay` in `geneOrderStar.ts` would put both star launchers in one
  module.
- **`chainPath` guesses converter file names.** `chainPath` (`geneOrderStar.ts`)
  rebuilds `liftOver/<ref>To<Mate>.over.pif.gz` from a capitalisation rule.
  Carry the path per mate from `scripts/extractSyntenyTracks.ts` instead.

## Small, take when touching the file

- Dead exports:
  - No importer at all: `DEFAULT_LAYOUT`, `byOrganismNewestFirst`,
    `summarizeRemovedTracks`, `formatNumber`, `ProductTranscript`.
  - About 30 more are flagged by an importer scan.
- Dead or redundant code:
  - the old `synteny_pairs.json` compatibility branch in `syntenyPairIndex.ts`;
  - `launchPlan`'s unused `choice` fallback;
  - `PangenomeGraph`'s optional `haplotype`;
  - the redundant `examples` prop in `[dataset].astro`.
- Unused or duplicate dependencies:
  - `node-sql-parser` is in `website/package.json` and root, but only
    ucsc2jbrowse uses it;
  - `prettier` and `@types/react` are duplicated in the website's
    `dependencies`.
- Stale docs:
  - CLAUDE.md and `features.ts` say `features.staging` gates pages and which
    build links target. Neither is true since `JBROWSE_BASE` became fixed at
    `main`.
  - The comments in `focus.ts` (`presetOf`), `fetchJson.ts`, `global.d.ts` and
    `orthologSet.ts`'s header are out of date.
- Leftover `useMemo`/`useCallback` under the React Compiler (21 of them): remove
  each only where the compiler is confirmed to compile that component.
- House style:
  - explicit return types and early returns throughout;
  - the five positional parameters of `residueHeadline`;
  - `ColorChoice` typed as a plain `string`.
- Pinning `@jbrowse/graph-walks` exactly (each major reads one walk format)
  conflicts with the user's always-latest rule (memory: `deps-always-latest`).
  Don't do it; let `check-pangenome-launches` catch a format change.

Delete this file once the items above have landed or moved to `ideas/`.
