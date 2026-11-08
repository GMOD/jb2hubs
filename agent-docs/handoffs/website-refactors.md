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
`9642213e61f4`. Everything below is unstarted.

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

These are in the recommended order. Move the directory last, because every item
before it churns the same files.

- **One worker client.** `layoutClient` (`pangenomeGraphLayout.ts`) and
  `walkFormsClient` (`pangenomeWalkFormsClient.ts`) duplicate:
  - the spawn, and the pending map;
  - reject-all on a worker crash;
  - terminate-and-repost on abort.

  The walk-forms side also imports `errorOf`, `replyError` and `ReplyError` from
  the graph-layout module. Move both clients into a dedicated
  `pangenomeWorkerClient.ts`, with the deadline (walk forms) and
  drop-on-other-window (layout) as options, plus a worker-side `serve(handler)`.
  - **Trap:** the abort and repost semantics differ slightly. The layout client
    deletes the pending entry in `onmessage`; walk forms deletes it in `settle`.
  - **Check:** both clients' tests carry over, then
    `pnpm check-pangenome-launches`.

- **One mark vocabulary.** `pageMark` (`pangenomeWalkForms.ts`) turns
  graph-walks' `SiteMark` into the page's own mark type, renaming `shift` to
  `shifted` and `net` to `replacement` plus `net`. `walkMark`
  (`pangenomePanels.ts`) turns a sidecar mark back into graph-walks' `Mark` so
  `markTag` can name it.
  - **Evidence:** the round trip lost the gain sign once (`d69fd83895b1`), and
    fixes followed in `c3e3f765a6ac`, `a85ed3319d34` and `522f3e29904e`.
  - **Proposal:** make graph-walks' `Mark` the page's mark type, with a small
    union for the page-only states (`uncalled`, `rarer`, `bypassed`), and have
    the sidecar reader (`pangenomeSvStates.ts`) emit `Mark`.
  - **Trap:** sidecar marks carry no exact lengths. `walkMark`'s `diffuse` rule
    for a net replacement has to survive.
- **A tested prose module.** The answer's wording (`readingSentence`,
  `carriersOf`, `nameList` and `spoken` in `PangenomeRegionBox.tsx`) is in a
  component no test reaches, and it changed in five commits this period. Move it
  to a `pangenomeProse.ts` beside `headline` (`pangenomePanels.ts`), along with
  the two bp formatters (`pangenomePanels.ts`, `PangenomeGraph.tsx`), and add
  tests. Rename the box's `placed: string[]` prop as well: it collides with
  `panel.placed: number`, and its value is `matrixRows.order`.
- **Other dedicated modules:**
  - `pangenomeMapLayout.ts` for `PangenomeMap.tsx`'s pure layout code: tickStep,
    scale, packRows (untested), placement, and a `spanStyle` written three
    times.
  - The focused-row launch and `rowsFocusable` move from
    `PangenomeRegionBox.tsx` into `pangenomeAnswer.ts`, so
    `check-pangenome-launches` can boot the exact url.
  - One `gff3.ts`: `pangenomeKnownAlleles.ts` and `pangenomeOmia.ts` write GFF3,
    while `pangenomeRefSeqGenes.ts` and `pangenomeGeneModels.ts` read it and
    disagree on unescaping. **Trap:** touching GeneModels rebuilds the HPRC
    genes (`buildHprcGenes.sh` hashes its converter sources; about 20 minutes on
    ada).
  - A `bucketDir` field on the dataset, replacing the four ways the graph's
    bucket directory is derived (`knownAllelesFile`, `pangenomeCatalogs.ts`,
    `generatePangenomeOmia.ts`, `pangenomeLinks.test.ts`).
  - One excluded-samples list instead of `'CHM13'` in three places
    (`comparedColumns`, `EXCLUDED_SAMPLES`, `printWalkForms`). Make
    `minCarriers` required rather than defaulting to HPRC's
    `minCarriersFor(462)`.
- **Split the sidecar module into writer and reader.** Ten exports of
  `pangenomeSvStates.ts` serve only the build scripts. The format-3 row is
  written by a template string in `restorePangenomeSvStates.ts` and parsed in
  `parseSvStateRow`.
  - Add a `formatSvStateRow` beside the parser.
  - Add a test that each `build*SvStates.sh`'s `FORMAT=` matches its dataset's
    `svStatesUrl`.
  - Optionally add a `#format` header the reader checks. This sits under
    CLAUDE.md's FORMAT/url rule.
- **The shared shell steps of the sidecar builds.** The `#haplotypes` header,
  bgzip and `tabix -0` step is written three times, and the
  `PUBLISH=0`/copy/invalidate ending five times. Both could move into a sourced
  `svStates.sh` (broaden `minigraphSvStates.sh`). See also
  `agent-docs/ideas/ready/shell-dead-code-and-shared-skeletons.md`.
- **The CSS.** About 300 lines of `ui.css` (`ui-lane*`, `ui-mark*`, `ui-tick*`,
  `ui-gene*` and friends) are used only by the three Pangenome components. Those
  components import no stylesheet; the rules arrive only because
  `GeneCombobox.tsx` imports `ui.css`. Move them to `styles/pangenome.css`,
  imported by the components that use them.
- **The directory (last).** Move the 46 `pangenome*` files in `src/components/`,
  plus the root `generatePangenome*.ts`, `restorePangenomeSvStates.ts` and
  `pangenomeHprcIndex.ts`, to `src/pangenome/`, with a `build/` folder for the
  build-only modules (`pangenomeGeneModels`, `pangenomeLocusGenes`,
  `pangenomeOmia`).
  - **Also:** give the window-width rule (`MAX_DETAIL_WINDOW_BP`, `isWide`) its
    own file; it sits in the human loci data.
  - **Cost:**
    - `buildHprcGenes.sh`'s `CONVERTER_HASH` paths, which means one gene
      rebuild;
    - the `.oxlintrc.json` no-console override;
    - `scripts/checkPangenomeLaunches.mjs`;
    - the pangenome paths in `scripts/checkCatchAlls.mjs`;
    - the worker `new URL` siblings;
    - CLAUDE.md's pangenome section.
  - **When:** only while no other pangenome work is in flight.
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
  - `GeneOrderSection` gets `key={`${geneId}|${refTaxId}`}` in
    `GeneOrderPage.tsx`. That deletes its `useResetOnChange` and the guard
    against the previous gene's data.
  - `useCombobox` keeps `{key, index}` and reads the index only when the key
    matches. Then delete `src/hooks/useResetOnChange.ts`.
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
