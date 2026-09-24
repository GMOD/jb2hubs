# jb2hubs

Monorepo that converts UCSC GenArk and UCSC browser hubs into JBrowse 2 configs,
and serves them via a static website.

## Packages

- `website/` — Astro + React static site (pages: search, recently-updated,
  accession, taxonomy, hubs, synteny, etc.)
- `genark2jbrowse/` — scripts + TS that process GenArk hubs into JBrowse configs
- `ucsc2jbrowse/` — scripts + TS that convert UCSC track hubs into JBrowse
  configs
- `hubtools/` — shared TS library used by the converter packages
- `lib/` — shell libraries both pipelines source: `common.sh` (control plane,
  `parse_flags`, incremental gates, rclone sync) and `chainpif.sh` (chain →
  PIF), each with a `*.test.sh` beside it that CI runs
- `scripts/` — repo-level node utilities (`checkConfigCompat.mjs`,
  `checkPluginUrls.mjs`, `extractSyntenyTracks.ts`) invoked from `package.json`
  and `run.sh`
- `agent-docs/` — design notes, surveys and ADRs, indexed by its own `README.md`

## Lint, format, typecheck (oxc toolchain)

`pnpm lint:fast` (oxlint, syntactic) → `pnpm lint` (`oxlint --type-aware`, the
full typed rule set via tsgolint) → `pnpm typecheck` (`tsc --noEmit`). ESLint is
gone; the rules live in `.oxlintrc.json`, and both `eslint-disable` and
`oxlint-disable` comments are honored.

There are currently **no disable comments in the tree**, which is worth keeping:
a rule that a whole directory legitimately violates belongs in an
`.oxlintrc.json` override, not a header comment repeated in 44 files. That is
how `no-console` is handled — off for the CLI/build-script trees
(`genark2jbrowse/src`, `ucsc2jbrowse/src`, `website/generate*.ts`, `scripts/`),
where stdout _is_ the output, and on everywhere else.

There are no file-scoped overrides either, and that took two rounds. The oxlint
1.80 bump surfaced six `react/set-state-in-effect` violations; five were fixable
at once (three were the same reset-on-change effect and now share
`useResetOnChange`, `ProteinBrowser` derives what it was clearing, and
`useUrlState` is a `useSyncExternalStore` over the URL, which is what the rule
was pointing at all along). The sixth, `OrthologSearch.tsx` seeding four pieces
of state from `location.search` on mount, kept an override until 2026-09-01,
when that shell became `GenePage.tsx` and the state became `useUrlState` values
with uncontrolled inputs keyed on them — no effect, no override. Reach for an
override only after finding that the effect really is the synchronization it
looks like; so far every one has turned out not to be.

One thing `.oxfmtrc.json` must keep ignoring: `**/.*-uploaded.json`, the
`upload_if_changed` stamps (currently just
`genark2jbrowse/.categories-uploaded.json`). A stamp is a **byte-exact** copy of
the file it tracks, compared with `diff -q`, and the generated
`categoryIndex/categories.json` ends without a trailing newline — so letting
oxfmt add one would make every later run see a change that isn't there and
re-upload plus invalidate CloudFront forever. Format it and you break change
detection, not just the diff.

`pnpm format` / `pnpm check-format` is `oxfmt` for everything it parses
(ts/tsx/js/json/md/css) **plus prettier for `**/*.astro` only** — oxfmt has no
astro parser, which is the only reason prettier and `.prettierrc.json` are still
here. Keep `.oxfmtrc.json` and `.prettierrc.json` in sync (same
`semi`/`singleQuote`/`trailingComma`/`arrowParens`/`singleAttributePerLine`) or
JSX drifts between `.tsx` and `.astro`.

Every `typescript` in the tree is now **7.x** (the native compiler) — root and
`hubtools` both `^7.0.2`, and nothing else declares one. Type-aware oxlint
requires it. One consequence worth knowing before "upgrading" anything else:

- `astro check` is **gone**, and with it `@astrojs/check` /
  `@astrojs/language-server` and website's own TypeScript pin. The language
  server drives the TypeScript **JS API**, which TS 7 does not expose enough of
  (`Cannot read properties of undefined (reading 'fileExists')`), and it was the
  only thing left holding a TS 6. Cost: `.astro` **frontmatter is no longer
  typechecked** — `tsc` can't parse `.astro`, so root `pnpm typecheck` covers
  `.ts`/`.tsx` only. Anything type-sensitive belongs in a `.ts`/`.tsx` module
  the page imports, not in the frontmatter. One catch when you do move code out:
  a frontmatter import of a **generated, gitignored** JSON was invisible to
  `tsc`, and becomes a hard `TS2307` the moment it lands in a `.ts`. That is how
  CI's typecheck broke for four days from 2026-08-02. Declare such a module in
  `website/src/global.d.ts` rather than teaching CI to generate the file.

`hubtools` used to pin 6.x, because `tsdown --dts` goes through
`rolldown-plugin-dts`, which failed on TS 7 with
`Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')`.
That was lifted on 2026-08-03 (`a0a9f8c2a2e`) and verified on 2026-08-05:
`pnpm build` emits with typescript@7.0.2, every export lands in
`dist/index.d.mts` with real types, and that file typechecks clean under
`tsc --strict --types node`. Re-run those three if `tsdown` or
`rolldown-plugin-dts` is bumped — a dts emitter degrades quietly, so "the build
passed" alone does not prove the types survived.

`pnpm typecheck` runs `astro sync` first, because the root tsconfig includes
`website/.astro/types.d.ts`.

tsgolint validates every `tsconfig.json` it loads and is stricter than TS 6 was:
an `outDir` needs an explicit `rootDir`, and `moduleResolution: node` (node10)
is rejected outright. A tsconfig error there fails `pnpm lint` before any rule
runs.

## The website is a major version ahead of published `@jbrowse/core`

This is one situation with several symptoms, and every piece of machinery below
disappears together when `@jbrowse/core` **v5** publishes. That tree already
sits on `@mui/material` 9.3, `@mui/icons-material` 9.3, `mobx` 7 and
`@jbrowse/mobx-state-tree` 6 — the exact set the website and react-msaview 8.x
already use — so the gap is a release, not a design decision.

The newest **published** core is 4.3.0, on MUI 7 / mobx 6 / MST 5. The website
and `react-msaview@8.1.0` are on MUI 9 / mobx 7 / MST 6. Install them together
and both copies of each land in the page, at which point the alignment viewer
does not render **at all**:

- `[MobX] There are multiple, different versions of MobX active`, and then
  `[mobx-state-tree] Identifier types can only be instantiated as direct child of a model type`
  — MST refuses to build the viewer's model.
- A MUI 7 theme (core's `createJBrowseTheme`, which is what react-msaview
  renders under) handed to MUI 9's `ThemeProvider`. One component reads a field
  whose shape moved and throws
  `Cannot read properties of undefined (reading 'length')` from its zoom
  `ToggleButton` — and react-msaview's error boundary is above the whole view,
  so the page shows a red bar where the alignment was, not a missing button.

`pnpm-workspace.yaml`'s `overrides` hoist core onto the newer four. That alone
is not enough: core 4.3.0 imports `@mui/icons-material/HelpOutline` in two
modules, an unsuffixed alias MUI 9 dropped (it is `HelpOutlined` there), and an
unresolvable import 500s the whole react-msaview chunk at prebundle — a harder
failure than the one being fixed. So `patches/@jbrowse__core@4.3.0.patch`
renames those two imports and nothing else.

Measured in a browser on 2026-08-26, all three states: **overrides + patch** →
the 100-way alignment draws, zero console errors; **overrides alone** → dead on
the MUI theme; **neither** → dead on mobx/MST. Re-run that, don't reason about
it — every one of these fails inside an error boundary, so a green build proves
nothing.

**Delete `overrides`, `patchedDependencies` and `patches/` together** when core
v5 lands, and check with a browser rather than a build.

### Why react-msaview keeps landing ahead of core

react-msaview is released from a repo that develops against jbrowse-components
`main`, so a fresh msaview routinely needs a core that has not shipped. This is
the second time: `patches/react-msaview@5.6.3.patch` existed because 5.6.x
imported `statusMessageText` from an `@jbrowse/core` that did not export it, and
`astro build` died with `[MISSING_EXPORT]`. **6.2.0 upstreamed that fix** — its
`fetchUtils.ts` inlines the one-liner — so that patch is gone.

When bumping it, check the published tarball against the installed core before
trusting a green install, because the build-time half of this is silent until it
isn't:

```
npm pack react-msaview@<version> && tar xzf react-msaview-<version>.tgz
grep -rhoE "from ['\"]@jbrowse/core[^'\"]*['\"]" package/dist/ | sort -u
grep -rhoE "['\"]@mui/icons-material/[A-Za-z0-9_]+['\"]" package/dist/ | sort -u
```

The second line is worth running against **core's** own `esm/` too, which is how
the `HelpOutline` breakage above was found. As of 8.1.0 react-msaview itself is
clean against MUI 9 — 21 icon imports, all present in 9.4 — and its 14
`@jbrowse/core` module paths all exist in the patched 4.3.0; core is the one
that is not clean.

8.x declares `@jbrowse/core >=5.0.0-0` as a peer, so pnpm warns about the
installed 4.3.0. The warning is expected until v5 publishes: on 2026-09-24 the
TP53 page under `astro dev --mode staging` drew the 100-way alignment in
react-msaview 8.1.0 on the patched 4.3.0, tree and conservation tracks included,
with no console errors from the page.

## Generated files — do not hand-edit

`ucsc2jbrowse/configs/*.json` and `genark2jbrowse` configs are 100% generated by
the shell-script pipelines (`make.sh`, `enhanceConfigs.sh`, `src/*.ts`, etc.).
Never edit them by hand — changes are clobbered on regeneration. To add or
change tracks on a UCSC assembly, edit the source-controlled extension file
(e.g. `ucsc2jbrowse/ucscExtensions/hg38.json`, `ucscExtensions/hs1.json`), whose
`tracks[]` are merged into the generated config by the pipeline; then regenerate
and re-upload the configs.

## A converter change invalidates every UCSC config, and make.sh knows it

`ucsc2jbrowse/make.sh`'s incremental gate stamps **two** hashes per built
assembly, and reprocesses when either differs: `.trackdb_hash` (the content of
`trackDb.txt.gz`, i.e. the data) and `.pipeline_hash` (`source_tree_hash` over
the converter itself, i.e. the code). Only the first existed until 2026-08-06.

That is not a theoretical gap. `getTrackModifications` runs inside
`addMetadata.ts`, which make.sh only invokes for assemblies the gate marked
changed — so `24cbca057b6`, which exempted hg19's CRG/Duke mappability bigWigs
from the `wgEncode` drop rule, was followed by a `./run.sh` that logged
`No UCSC assemblies have changed`, regenerated nothing, and shipped the same
configs. The line reads like success, which is what made it cost a day. There is
no downstream gate that could have caught it either: `check-plugin-urls`,
`check-sidecar-urls` and `check-config-compat` all validate the config that
exists, not the one the current code would produce.

Two things to know when changing this:

- **The `PIPELINE_SOURCES` list in make.sh is deliberately broad** — every
  `ucsc2jbrowse/*.sh`, `src/`, `ucscExtensions/`, `ucscRenames/`, `lib/` and
  `hubtools/src`. The error directions are not symmetric. Over-invalidating
  costs one reprocess, and a reprocess is cheap on a warm tree: the per-file
  derivations are `needs_rebuild`-gated, so only the configs are actually
  re-derived. Measured 2026-08-06 by reprocessing hg19 alone, the worst
  assembly: 2m40s for the whole `make.sh` run, of which hg19's own Phase 2 was
  67s and the text-index passes were 10s and 23s. Under-invalidating ships wrong
  configs indefinitely. Add new inputs to the list rather than reasoning about
  whether they matter.
- **`.pipeline_hash` is written on every mode**, including `--reprocess-all` and
  `--skip-download`, unlike `.trackdb_hash`. Whatever else those modes skip, the
  code that just built the configs is the code in the tree; not recording it
  would make the next incremental run reprocess all 238 again.

`source_tree_hash` lives in `lib/common.sh` (tested by `lib/common.test.sh`). It
keys on paths relative to the repo root so the hash survives a different
checkout location, excludes `*.test.*` (a test cannot change what a build
emits), and errors on a path that does not exist so a rename fails loudly
instead of silently dropping a tree from the hash.

### The same blind spot exists one level down, in `needs_rebuild`

`needs_rebuild` stamps the source _table_, so it cannot see a change to the code
that converts it. `encodeGffAttribute` learned to escape control characters and
dm6's and droPer1's `ncbiRefSeq.gff.gz` sailed through a full reprocess still
holding raw carriage returns, because their golden-path tables had not moved;
both had to be cleared by hand. `DERIVATION_HASH` in `ucsc2jbrowse/make.sh`
closes it: when it differs from `$UCSC_BUILT_DIR/.derivation_hash`, make.sh
exports `REDERIVE=1` and `needs_rebuild` rebuilds regardless of the table.

Two properties hold this together, and breaking either is silent:

- **`DERIVATION_SOURCES` must stay a subset of `PIPELINE_SOURCES`.** A change to
  the derivation code therefore also moves `PIPELINE_HASH`, which marks every
  assembly changed, which is what actually puts the derivation scripts in front
  of every file. Without that containment `REDERIVE` could fire on a run that
  visits only some assemblies, and the stamp written at the end would claim the
  rest were re-derived too. This is why `bed2gff/src` is in **both** lists.
- **An absent stamp bootstraps rather than re-deriving.** The code that produced
  what is already on disk is unknowable, and assuming the worst would spend
  hours re-deriving every bed/gff/rmsk file on an unrelated run. Recording the
  current hash makes every _later_ change detectable, which is the property that
  was missing. The cost of the bootstrap is one blind spot for outputs built
  before 2026-08-06; the alternative was a permanent one.

### genark2jbrowse has no such gate any more, because nothing it guards is expensive

Until 2026-09-01 genark's "new" mode meant "this accession has no hub.txt yet",
so an existing hub's config was never regenerated and a converter change reached
none of the 52,000 until someone remembered `--reprocess-all`; a repo-level
`.pipeline_hash` escalated the run to "all" when the code moved, and the work
list for a run lived in a `mktemp` that a crash deleted.

All of that existed to avoid rebuilding configs, and a config build is 17
seconds for the whole corpus now (see the one-pass section below). Every other
phase is gated per file — a GFF is downloaded when absent and processed when
newer than its output, genetic codes derived when the sidecar is missing, chain
files probed once per hub, text indexed when older than the GFF — so a run
simply visits every hub, every time, and rebuilds what is stale. `--all` is
accepted and changes nothing; `--reprocess-all` still forces everything.

### `--explain` answers what a run would do, before it does it

Every ucsc gate above is a pure predicate over local stamps, so
`ucsc2jbrowse/make.sh` takes `--explain`: it runs the gates, prints the verdict
and the reason, and exits without fetching, writing or building anything. It is
`make -n` for a pipeline that is not a Makefile, and it exists because the gates
are only readable by running them — the hg19 mappability regression cost a day
partly because `No UCSC assemblies have changed` reads like success, and there
was no way to ask the question first.

Two properties are what make it worth trusting, and both are easy to break:

- **It calls the code the run calls.** `detect_changed_assemblies` and
  `would_rsync` in `ucsc2jbrowse/make.sh` were extracted so the report and the
  build share one implementation; `explain_stamp` (`lib/common.sh`) only renders
  a comparison the caller has already decided into `REDERIVE` or `MODE`. A
  second copy of any of that would be a model of the run rather than the run,
  and would be most confident exactly when it had drifted.
- **It says what it cannot know.** The report is exact on the code half and
  as-of-last-rsync on the data half, because a real run syncs first, and says so
  rather than implying a precision it does not have. It also lists what runs
  regardless — Phase 3 onward always does — so a clean report reads as "nothing
  is rebuilt", not "nothing happens". genark's `--explain` has nothing to
  predict and says that instead.

Answers grouped by reason, not one line per assembly: a converter change marks
all ~240 stale for the same reason, and the ungrouped form buries the two that
actually got new data.

## A UCSC config is built in one pass, from scratch, on every run

`ucsc2jbrowse/src/buildConfigs.ts` rebuilds `config.json`, `minimal.json` and
`config-staging.json` for **every** assembly the genome list names, in memory,
from the files the earlier phases leave beside it — `tracks.json`, the derived
`*.bed.gz`/`*.gff.gz`, `gff/<db>.gff.gz`, the GENCODE files, `liftOver/*.pif.gz`
— plus a live `hub.txt` fetch for the 17 hub-backed entries. Each file is
written only when its text changed, in the format `pnpm format` would produce.
The whole walk is under two minutes for 238 assemblies, most of it hg38's 32 MB
`tracks.json`.

Until 2026-09-01 the same config was assembled by ~14 separate read-modify-write
passes (23 on hg38) spread over three `make.sh` phases — `createAssembly`, the
big-file merger, two tabix adders, `removeEverythingButLatest`, two
`jbrowse text-index` passes, extensions, `jbrowse add-track` for the NCBI GFF
and seven GENCODE files, chain tracks, metadata, name suffixes, renames,
enhance, genetic codes, then the six-step finalize walk — and most of them ran
only for "changed" assemblies, which is how a converter fix could ship to none
of them (the hg19 mappability incident above). Rebuilding every config every run
is what closes that class for good: the `.pipeline_hash` gate now decides only
which assemblies get their **track files** re-derived, never which configs are
current.

The step order in `STEPS` is the order the passes used to run, because that
order is what every published config's key order is; the adjacencies that are
load-bearing are listed at the top of the file. **Add a step by putting it in
`STEPS`, and say whether its position matters.** A step takes a
`FinalizeContext` (`src/utils/finalizeStep.ts`), mutates `ctx.config` in place,
and returns counters for the run summary; it never reads or writes `config.json`
itself. `--out-root <dir>` writes the three files there and touches nothing
else, which is what makes the diff below cheap.

Three things moved on purpose:

- **Text indexing runs after the config is written** (`textIndex.sh`, over the
  assemblies `textIndexPlan` reports as missing an index or holding one older
  than its sources). `jbrowse text-index` reads the NCBI GFF track's indexing
  policy off its `textSearching` slot, and the old order indexed a freshly
  generated config before enhance had put the policy on it. The index is named
  after the config's assembly, which for a GenArk-backed alias is the accession:
  looking for `trix/<db>.ix` instead is why rn8 was re-indexed on every run.
- **The NCBI GFF and GENCODE files are hard links** into the built dir, matched
  by inode, not `jbrowse add-track --load copy` copies remade on every
  reprocess.
- **Staging is an in-memory second enhance** (`stagingEnhanceOptions` in
  hubtools), not a copy plus a re-run with env set.

Verified on 2026-09-01 by building all 238 into a scratch tree and diffing
against the committed `configs/` and `configs-minimal/`: 230 of 238 configs
byte-identical once the `indexingFeatureTypesToInclude` list hubtools stopped
writing on 2026-08-28 is dropped from the committed side, 4 identical apart from
top-level key order (they had never been through the fresh chain), and 4
differing in content that had moved upstream or was stale in git: hg38's trackDb
re-synced that morning, `cb1`'s first real build, `enhLutNer1`'s
never-regenerated plugin urls, and a hub whose `hub.txt` gained a field. The 230
`minimal.json` and 231 `config-staging.json` matched the same way.

## A GenArk config is built in one pass, and written in its final format

`genark2jbrowse/src/buildConfigsBatch.ts` assembles each hub's `config.json` in
memory — hub.txt → NCBI GFF track, trix adapter and genetic codes →
`genArkExtensions/` → liftOver synteny tracks → `enhanceConfigObject` — and
writes it once, only when the text differs from what is on disk. Until
2026-09-01 that was seven read-modify-write passes by five tools (a generator,
`jbrowse add-track`, `jbrowse text-index`, two jq splices, an extension merger,
a chain-track adder, then enhance), each leaving a half-built config on disk
between them: 52,720 hubs × 7 parses, ~89,000 `@jbrowse/cli` process starts, and
a run that was aborted mid-way left every config in whatever intermediate state
its pass had reached. The one pass builds all 52,720 in **17 seconds**.

The pure half is `buildHubConfig` (`src/buildConfig.ts`), and the step order in
it is the order the passes used to run, because that order is what every
published config's **key order** is. Verified on 2026-09-01 by building all
52,720 into a scratch tree and diffing against the committed `hubs/`: 52,718
byte-identical once the `indexingFeatureTypesToInclude` list hubtools stopped
writing on 2026-08-28 is dropped from the committed side (the tree had not been
regenerated since), and 2 differing only in a liftOver track name that today's
`all.json` spells differently. Re-verify the same way after touching it —
`--out-root <dir>` writes the configs there and touches nothing else, which is
what makes the diff cheap.

Three things the pass changed on purpose, each removing a cost that scaled with
52,720:

- **The output is already in oxfmt's format.** `formatJson` (`hubtools`) prints
  what `oxfmt` prints for a `.json` file at printWidth 80, checked on 3,000
  committed configs, and the batch writes with it. `pnpm run format` in `run.sh`
  used to reflow every hub config on every run, which is why an aborted run
  showed 52,475 modified files: the pipeline wrote one shape and the formatter
  another. Now an unchanged hub is not rewritten at all, so `git status` mid-run
  lists only hubs whose content moved.
- **Genetic codes are derived once, beside the GFF.** `deriveGeneticCodes.sh`
  writes `bgz/<gff>.codes.tsv` (empty when there are none, so presence means
  "derived"), gated on the sidecar being missing or older than the GFF. The old
  pass re-scanned every 100 MB GFF through awk on every hub visit. The builder
  refuses a GFF without a sidecar rather than silently writing a config with no
  codes.
- **The hub's copy of the GFF is a hard link to `bgz/`**, matched by inode, not
  a `--load copy`. That was a third copy of ~40 GB and a re-copy on every
  `--all` run.

`jbrowse text-index` still runs, but **after** the config is written
(`textIndex.sh`, over the hub dirs the batch prints as needing an index). It
reads the indexing policy off the track's `textSearching` slot, and the old
order indexed a freshly generated config before enhance had put the policy on it
— so a `--reprocess-all` was building indexes of UUIDs while the config said
otherwise. The CLI rewrites `config.json` in its own layout; `formatConfigs.ts`
puts those back.

### A derived url that 404s is not a download that has not happened yet

`hubtools`' `parseAssemblyEntry` **builds** each hub's `ncbiGff` url from the
accession; NCBI does not publish it. For an assembly NCBI never annotated the
directory is there and the `*_genomic.gff.gz` simply is not — checked by hand on
`GCF_002986165.1`, which has the fna, the gbff and the assembly report and no
gff. Existence of the download was the only gate, so those urls were requested
again on **every run, forever**: measured 2026-09-09, the same 71 attempted and
the same 71 failed in every log going back weeks, 27s and 142 lines of
`Fetching…/Failed…` per run against ftp.ncbi.nlm.nih.gov.

`downloadNcbiGff.sh` now writes a `gff/<file>.notfound` sentinel, the way
`ncbi.json.notfound` records a missing metadata record, and only on a 404/410 —
classified with one HEAD, and only on a failure, so the steady state is zero
requests rather than 71. A timeout or 5xx leaves no sentinel, so an
ftp.ncbi.nlm.nih.gov blip cannot switch off an annotation we do have a url for.
`NOTFOUND_TTL_DAYS` (90) expires it so an annotation published later is still
picked up, `FETCH_UPDATES=1` ignores it, and a successful fetch clears it. The
count of suppressed urls is printed, because a suppression nobody can see is how
a whole class of assembly quietly stops getting an annotation. mtime is a safe
clock here, unlike in `buildNcbiQueue.ts`, because `gff/` is gitignored and so
survives no clone to have its mtimes reset.

### A GCA hub's gene search comes from xenoRefGene

GCA hubs get no NCBI GFF, so the text index above never covers them. 7,885 of
them carry UCSC's `xenoRefGene` bigBed, RefSeq mRNAs from other species aligned
to the assembly and named only by accession. `xenoSymbolIndex.sh` joins those
accessions to symbols cut from NCBI's `gene2refseq.gz` and writes
`trix/<accession>.ix` in `jbrowse text-index`'s record format, one record per
symbol per overlapping cluster, indexing the symbol only. The config gets the
same `trixAdapter` entry a GCF hub gets, so every JBrowse release that searches
a GCF hub searches these.

- **The index is built before the config**, and `buildConfigsBatch.ts` adds the
  entry only when the index exists, so a hub whose bigBed failed to fetch has no
  search rather than a broken one.
- **The bigBeds are an rsync mirror** (`genark2jbrowse/xenoRefGene/`, ~2 GB).
  `rsync -t` over the daemon, 4,000 paths a connection, skips a file whose size
  and mtime match and keeps upstream's mtime on the copy, so UCSC sends each
  bigBed once and then only what it changed. A hub is rebuilt when its index is
  older than its mirrored bigBed or the symbol table, so a symbol refresh and
  `--reprocess-all` read the mirror and ask UCSC for nothing.
- **The symbol table is refreshed every 30 days** (`refseqSymbols/`, 4 minutes
  and 2.4 GB streamed from NCBI), and a refresh rebuilds every index.

## A hub.txt is refreshed by rsync, not fetched once and kept forever

`downloadHubs.ts` fetched a hub's `hub.txt` the first time the assembly list
named it and never again outside `--reprocess-all`, so whatever UCSC later did
to that hub — renamed labels, a RepeatMasker track switched to `bigRmsk`, a new
liftOver chain to a sibling assembly — never reached its config. Measured
2026-09-01: 18,846 of 52,720 upstream `hub.txt` files carried an mtime newer
than our copy, and of 12 sampled 3 differed in content; the first full sync
changed 278 of them in content.

Three steps in `genark2jbrowse/make.sh`, a few dozen rsync connections in total,
because 52,000 HEAD requests against hgdownload is the kind of load the
track-url canary is budgeted to avoid:

- **`listUpstreamHubs.sh`** answers, for every hub, the size and mtime of
  `hub.txt` and whether the `2bit` and `chrom.sizes.txt` are there. It refuses a
  listing under 10,000 hubs: a truncated one would read as "every hub retired".
  `listUpstreamHubs.test.sh` pins the parser, the refusal and the dispatch
  below.

  It used to walk `rsync://hgdownload.soe.ucsc.edu/hubs/GCA/` and `GCF/` with
  `--list-only` and an include chain descending exactly four levels — 52,720
  hubs in 631 s, and 775 s when re-measured. That walk is still in the file as
  `walk_upstream_hubs`, because it needs nothing from upstream but the rsync
  daemon itself; `HUB_LIST_MODE=walk` forces it and the default falls back to it
  automatically. What replaced it: hgdownload publishes
  **`hubs/genArkFileList.txt.gz`**, a daily manifest of all 2.07M paths under
  `hubs/GCA` and `GCF` (10.5 MB, downloads in 0.15 s), so the accessions are
  known without walking anything and `rsync --files-from` is asked to stat only
  the ~158,000 paths we read. **13 s against 775 s.**

  Three measurements are why, and the first is the one that generalises. The
  walk's cost is hgdownload reading ~110,000 directories it then discards, and
  it is almost entirely **cache**-bound, not work-bound: the same GCA walk is
  68.8 s cold and 1.85 s warm, 37×, with 0.49 s of that on our side. Statting
  named paths barely moves — the same GCF/002 stat is 0.547 s cold and 0.532 s
  warm. And **parallelising the walk is not the fix**: four concurrent cold
  walks moved 188 hubs/s against 117 single-stream (~1.2× for 3× the
  connections, once the one subtree that came back warm is excluded), because
  the server is throughput-bound rather than latency-bound.

  Two things about the replacement are load-bearing. **`--files-from` must be
  chunked** — rsync's handling of it is quadratic in the list length, so the
  whole corpus in one call spends **74.8 s of client CPU** against 8 s of wall
  clock in chunks of 4,000; the fast version was slower than the walk until that
  was found. And **the manifest proposes candidates, it does not answer**:
  `src/upstreamHubCandidates.ts` unions its accessions with our own `hubs/` tree
  (so a hub gone upstream still gets a stat, which is the "gone upstream"
  finding) and with the assembly list (so a hub added in the last day is not
  reported as never having existed), and rsync's `--ignore-missing-args` makes a
  path that is not there simply absent from the output. Nothing downstream reads
  a stale answer, because nothing downstream reads the manifest.

  Verified 2026-09-04 against a full walk taken the same hour: the 52,722
  `hub.txt` rows are **byte-identical**, the new listing invents nothing, and
  both consumers agree exactly (`staleHubTxt.ts` identical output; the
  `downloadHubs.ts` verdicts identical, 24 gone and 0 missing-sequence). The
  only rows the walk had are 1,221 `<acc>.repeatModeler.2bit` and one
  `<acc>.chrNames.2bit`, which matched its `*.2bit` glob and which no consumer
  looks for — `downloadHubs.ts` asks for `<accession>.2bit` by name.

- **`src/staleHubTxt.ts`** prints the paths whose local size or mtime differs
  from the listing, and `rsync -t --files-from` copies exactly those. `-t`
  leaves upstream's mtime on the copy, so the comparison is exact from then on
  and needs no stamp file; a fresh checkout, whose mtimes are checkout times,
  costs one full copy (all 52,720 in 890 s) and is exact after it. `git status`
  on `hubs/**/hub.txt` then says which changed in **content**, and those hubs
  lose their `liftOver/.checked` so the chain probe runs again for them — a
  refreshed `hub.txt` is how a new chain gets noticed at all.
- **`downloadHubs.ts`** fetches only hubs with no `hub.txt` yet, and reports two
  things the assembly list cannot say: every accession it names that the listing
  did not find, and every hub whose `2bit` or `chrom.sizes.txt` is gone. The
  first is split by whether we publish a config for it, because UCSC's
  `assemblyList.json` names 23 hubs that have never existed on hgdownload (404
  on both hosts, absent from rsync), and those are noise; a hub we have and
  upstream no longer does is the finding, and it is no longer fetched. The
  second is the GenArk half of the sidecar problem — `loadPre()` fails the whole
  assembly on either — answered from the same stat pass, not from the
  105k-request probe that the reverted mirroring sweep was.

The rsync daemon lags the web host by under an hour (192 files changed upstream
between the first listing and its copy, and were current on the next listing),
so a few "still stale" entries right after a sync are the window, not a bug.

A failed listing skips the refresh for that run and says so; nothing is deleted
on either evidence. That report is where **GCF_000001405.40** shows up: UCSC's
`assemblyList.json` still lists the GRCh38.p14 GenArk hub, but its directory is
gone from both hgdownload hosts (hub.txt, 2bit, `chrom.sizes` and every bigBed
404; the API says "genome not found"), so the config we publish for it cannot
open. The accession page is unaffected — it launches `/ucsc/hg38` — and the
synteny drilldown already routes around it, but the config is still at its
permanent url, in `processedHubJson` for Desktop, and is the liftOver target of
other hubs' synteny tracks. Retiring or re-pointing it is a decision this report
keeps visible rather than one the pipeline makes.

## `hubs/` stays in git, and nothing depends on its history

The 52,720 GenArk configs (260k tracked files, 1.5 GB at HEAD) are committed on
purpose: `git diff` after a run is the one place that shows _what_ changed in
which hub, and it is what a converter change is checked against before it is
shipped. Measured 2026-09-01, git is not the cost it looks like — `git status`
1.4 s, `git diff --stat hubs/` 4.8 s — and what grew the repo to 1.2 GB on
GitHub was not the per-run traffic (1 to 100 hubs) but corpus-wide rewrites,
four of which in late August were the formatter reflowing what the pipeline
wrote. The one-pass builder writes oxfmt's format directly, so those are gone.

What made the history precious was one date: the recently-updated page needed to
know when each hub first appeared, and the only record was the commit that added
its config, so `generateRecentlyUpdated.ts` walked `git log -- hubs/` (1.2M
lines) and run.sh had to commit `hubs/` before the website build could run.
**`genark2jbrowse/hubFirstSeen.json`** is that record now: accession to the ISO
time of the run that first built its config, seeded once from the git log on
2026-09-01, appended to by `buildConfigsBatch.ts` for any accession it lacks
(never under `--out-root`), and committed beside `hubs/` by run.sh. It is
written with `formatJson` like the configs, so an ordinary run adds one line per
new hub and reflows nothing.

That leaves the history with no reader. Squashing it, or moving `hubs/` and
`ucsc2jbrowse/configs/` into a sibling data repo when the size does become a
problem, costs nothing the website or the pipeline reads. A manifest of hashes
instead of the files was considered and rejected: it says which hubs changed and
not what changed in them, and the second half is the one that catches a
converter regression.

## What belongs in `configs-minimal/`

`minimal.json` is a second, small config published beside every UCSC
`config.json` and named in the genome list as `jbrowseMinimalConfig`
(`src/transformGenomeList.ts`). `@cmdcolin/jbrowse-plugin-hubs` fetches it to
resolve a genome a synteny track references, so it is what the mate panel opens
with, and it is on the latency path of every cross-assembly launch. It is worth
keeping small — but small is a track-selection problem, not a metadata problem;
the trackDb prose in `metadata.ucsc.html` is 90% of its bytes and stays, because
it is what the track's About dialog shows.

`createMinimalConfig.ts` selects on two rules:

- **`MINIMAL_TRACK_PATTERNS`**, matched against a whole `trackId` segment —
  anchored at the start or just after a dash, never as a bare substring.
  Substring matching is what put every ENCODE regulation track in (`wgEncode`
  contains `gencode`, 82% of hg38's bytes), and what pulled `veGAPseudogene` and
  `cGAPSage` in under `gap`. `allGaps` needs its own entry because it is not a
  `gap` prefix; `dbSnp155ClinVar` is correctly **not** a `clinvar` one.
- **whatever the config's own `defaultSession` opens.** Not an extra pattern —
  the exception is derived from the session so the two cannot drift.
  `generateDefaultSessions.ts` picks the best gene track an assembly actually
  has (`ncbiRefSeq`, `ncbiRefSeqCurated`, `ncbiGene`, `refGene`, `ensGene`,
  `augustusGene`, `xenoRefGene`), and only the first three are names the
  patterns know. Every assembly predating ncbiRefSeq therefore used to open a
  track its minimal config had dropped — 134 of the 238, booting to an empty
  view: hg18/mm9 named `refGene`, danRer4 `ensGene`, the invertebrates
  `augustusGene` or `xenoRefGene`. The ordering that prevents this is now
  explicit: `generateDefaultSessions` precedes `minimalConfig` at the end of
  `src/buildConfigs.ts`, which documents why.

`enhLutNer1` is legitimately empty — it has no annotation to include. `cb1` and
`hgFixed` used to be counted beside it as "not assemblies at all", which was
half wrong and wholly an excuse; see the section on the two configs that named a
404 sequence.

`renames` used to be counted as a fourth, and was not an assembly at all: it was
a stray copy of `ucscRenames/hg38.json` (the trackId → new-name map, `"DELETE"`
sentinel and all) that had been swept up and processed as a config, leaving
`assemblies: [{}]` and four `unpkg.com` plugin urls frozen since 2025-08-11.
Deleted 2026-08-05. Two things let it persist, both now addressed — but the
first is structural and still worth knowing:

- **`configs/` was an append-only mirror.** `make.sh` copied
  `$UCSC_BUILT_DIR/<db>/config.json` to `configs/<db>.json` and never pruned, so
  a db that disappeared upstream left a config behind forever, still feeding
  `mergeAll`, `checkPluginUrls` and `checkConfigCompat`. Two things close that
  now, and the split between them is on **provability**:

  `prune_stray_configs` (`ucsc2jbrowse/common.sh`, called from make.sh's copy
  step for both directories) deletes a file only when it is **both** absent from
  the genome list **and** carries no `assemblies[0].name` — the same
  discriminator `checkPluginUrls.mjs` keys on, and exactly the shape of a
  swept-up rename map. That needs no judgement, so it does not ask.

  `pnpm check-orphan-configs` (`scripts/checkOrphanConfigs.mjs`, first in
  run.sh's `gate_configs`) fails the upload on the rest: a real, named config
  for a db UCSC no longer lists. **Retiring one stays manual** — these are
  permanent urls that published links and desktop installs keep naming, so it is
  a decision, not a cleanup.

  It walks the **built tree** as well as the two mirrors, and that half is the
  one that was missing. `uploadAll.sh` syncs `$UCSC_BUILT_DIR`, not `configs/`,
  so a `<db>/` directory there is served at `/ucsc/<db>/` whether or not a
  mirror of it survives — and every gate in this repo reads the mirror.
  `hgFixed` is the live proof: retired from `configs/` and from every walk that
  regenerates it on 2026-08-30, and `s3://jbrowse.org/ucsc/hgFixed/` has served
  it ever since. What it serves is a config with
  `"displayName": "undefined (hgFixed)"`, no tracks, a 2bit and a chrom.sizes
  that 404 so `loadPre()` rejects it outright, and four plugin urls on the
  frozen unversioned `/plugins/…/dist/` path that `checkPluginUrls.mjs`'s own
  `isLegacy` rule would reject if it could still see them. Deleting
  `$UCSC_BUILT_DIR/hgFixed` is what makes the next sync drop the prefix — except
  `liftOver/.checked` and `config.json.bak`, which the sync's `*.checked` and
  `*.bak` excludes leave behind, so clearing it outright takes an
  `rclone delete`.

  Both **refuse rather than act vacuously**: a genome list under 100 names, a
  missing or empty config directory, or no list at all is "could not run", never
  "no orphans". Getting that backwards would let one truncated fetch report the
  whole corpus as stray — and, in make.sh's case, delete it. run.sh reports the
  check's exit 2 separately from its exit 1 for the same reason.

  Both walks over `$UCSC_BUILT_DIR` — make.sh's copy step and
  `src/buildConfigs.ts` — also iterate the genome list's own keys rather than
  whatever directories happen to be there, so a stray `renames` cannot become a
  config in the first place. `hgFixed` was appended to both until 2026-08-30
  (below); the two directories now hold the genome list's 238 names and nothing
  else, and the built tree no longer has a `renames/` at all.

- **`mergeAll` deduped plugins on whole-object identity**, so the same plugin
  under two urls was two entries. `all.json` was asking PluginLoader to install
  each of the four plugins three times over. It now dedupes by name, preferring
  the canonical `latest/` path — see `mergePlugins` in `src/mergeAll.ts`. That
  list is also the one thing here that is a union rather than a copy of some
  assembly's, so `all.json` is now a `CONFIGS` entry in `checkConfigCompat.mjs`
  and gets booted: on the floor and `latest` only (26MB, and the merged plugin
  list is config content, identical on every host), from `$UCSC_BUILT_DIR` under
  `--local` so the pre-upload gate reads the file it is about to publish.
  Measured 2026-08-27: 10,968 tracks, 4 plugins, clean on both.

## Staging a config-level feature

`features.staging` (`website/src/config/features.ts`) only gates website pages
and which hosted JBrowse build links target — the configs themselves are one
tree served to both sites, so regenerating `config.json` publishes to production
too.

To stage something that lives in the config (a plugin, a track), have
`ucsc2jbrowse/src/buildConfigs.ts` write it into the **sibling**
`config-staging.json` it emits beside every `config.json` (and `mergeAll.ts`
into `all-staging.json`), and read the filename through `ucscConfigPath` /
`ucscAllConfigPath` in `website/src/config/jbrowse.ts`. It has to be a sibling,
not a `/ucsc-staging/` tree: a UCSC config names ~600 of its files relatively
(`centromeres.bed.gz`, `ncbiRefSeq.gff.gz`, `trix/*`) and jbrowse-web resolves
those against the config's own URL, so only a file in the same directory reaches
the data production serves. The sibling is the finished config run through
`enhanceConfigObject` a second time with `stagingEnhanceOptions`, which is
idempotent, so it adds the staging extras and changes nothing else.

Two things are staged this way today, both in `stagingEnhanceOptions`
(`hubtools/src/enhanceConfig.ts`): the BLAT plugin and the RepeatMasker track's
split-by-class multi-row display (`repeatClassDisplay: true`,
`hubtools/src/repeatClassDisplay.ts`). The second is waiting on a release rather
than on a decision — delete its gate and call `addRepeatClassDisplay`
unconditionally once a released `latest` carries `LinearMultiRowFeatureDisplay`.
Re-run the probe rather than assuming, since from this side the failure is
silent.

A third is added by `ucsc2jbrowse/src/buildConfigs.ts` itself, since it reads
the build's trackDb: one multi-way synteny track over every liftOver PIF the
anchor's config already names (`multiwayStarTrack.ts`), 165 of the 238 UCSC
configs. It opens on the anchor's multiz `speciesDefaultOn` where UCSC curated
one, and the lane picker offers every other mate grouped by the multiz clades.
The display fetches only the lanes it draws from jbrowse-components `64199e02e9`
on; a `jb2/main` built before it reads every child on every window, 240 for
hg38. So deploy `jb2/main` before uploading these siblings.

For **this** question the probe is not the cheapest instrument, and the browser
one cannot answer it at all — the fatal needs the track opened. What decides it
is whether a release has happened since the display landed, which a
jbrowse-components checkout answers outright:

```
git ls-remote --tags origin | grep -o 'v4\.[0-9]*\.[0-9]*$' | sort -V | tail -1
git cat-file -e <newest-tag>:plugins/canvas/src/LinearMultiRowFeatureDisplay/model.ts
```

`ls-remote`, not local tags, or a checkout that has not fetched in a while says
"no release yet" forever. Measured 2026-08-12: newest tag `v4.3.0` (2026-05-21),
which predates both displays — `LinearMultiSampleVariantDisplay` landed
2026-06-03, `LinearMultiRowFeatureDisplay` 2026-06-20, and both are absent from
`v4.3.0`. So both gates are still correctly closed, and neither is waiting on
anything either repo can do.

GenArk hubs are not staged (thousands of configs, nothing staged so far is
GenArk-specific), so a staged feature reaches `/ucsc/*` launches only. That is
the one gap in the repeat display: `addRepeatClassDisplay` handles a GenArk
`-repeatMasker` track too (its `bigRmskBed` has no class column, so the class is
derived off the name suffix `L1HS#LINE/L1` with a jexl `partitionField`), and it
matches ~16% of GenArk configs — 78 of a 500-config sample, one track each — but
nothing sets `RMSK_MULTIROW_DISPLAY` for the GenArk pipeline, so that branch is
written and tested rather than live.

**A release does not by itself unblock GenArk**, and this is the part worth not
mis-remembering: a GenArk `config.json` is the production file, at a permanent
url, that old hosts and old Desktop installs read. Keeping it booting on those
is a standing requirement, not a wait — so v5 shipping makes `latest` safe while
leaving every pinned v4 host exactly as fatal as before. Enabling GenArk means
staging it the way `ucsc2jbrowse` is staged, and the cost of that (a sibling
file per hub, thousands of them) is the actual open question, not the release.

The gate's GenArk half is pinned at the pipeline level in
`hubtools/src/enhanceConfig.test.ts` — including, deliberately, that the
production pass with the env UNSET leaves a GenArk `-repeatMasker` track
displayless. That is the assertion protecting the shipped file, and it is shaped
like the real configs: `<acc>-repeatMasker`, `BigBedAdapter`, and no `displays`
key, checked against `GCF_000001215.4` and 32 siblings.

`pnpm check-display-types` is the whole-corpus version of that question, and it
is worth running before promoting any display type because the answer is
narrower than the machinery suggests. Measured 2026-08-12 over **50,957** config
files, both arms: exactly two types are named anywhere — `LinearBasicDisplay`
(1,130 UCSC / 66,200 GenArk) and `MultiLinearWiggleDisplay` (39 UCSC / 0
GenArk). Both exist in **v4.0.0**, the oldest entry in `checkConfigCompat.mjs`'s
`HOST_VERSIONS`, so nothing currently shipped can hit the union fatal on any
supported host. That is also why the check is cheap: promoting a display type
means adding a third name to a vocabulary of two, and the script tells you the
moment one appears where you did not intend it.

Neither website serves configs — jbrowse-web resolves `?config=/ucsc/…` against
its own origin, so they always come from the jbrowse.org bucket
(`ucsc2jbrowse/uploadAll.sh`), which both sites read. **Upload the staged
configs before deploying the staging website:** a staging build links to
`config-staging.json`, and every launch fails to fetch its config until that
file is in the bucket. The reverse order is safe — an uploaded staging config
that nothing links to is inert.

## Old JBrowse versions read these configs

A hub config lives at one permanent url that desktop installs and published
links keep naming, so a regenerated config has to keep booting on hosts years
older than the one we develop against. **`plugins[].url` is the only field that
can kill a whole session** (`PluginLoader`'s `Promise.all` — one dead url and
the app is an error page). Content is otherwise forward-tolerant, measured on
v4.0.4 and main: an unknown track type, an unknown adapter, and the
`displayDefaults` shorthand all boot fine and cost the old host that one track
at most. So modernizing config content is not the risk it looks like; the plugin
url is.

**An unknown display type is the exception, and it is not scoped to its track.**
A `displays[]` entry naming a type the host lacks fails the track config's MST
union, so the config hydrates and then the app renders "Fatal error ...
[mobx-state-tree] No matching type for union" the moment something opens that
track. Measured 2026-08-09 on v4.0.0, v4.3.0 and main with
`LinearMultiRowFeatureDisplay` on `hg38-rmsk`: fatal on both released hosts,
fine on main, and declaring a `LinearBasicDisplay` entry ahead of it does not
help. The website side had already found this independently for
`LinearMultiSampleVariantDisplay` (measured 2026-08-06; the website has since
dropped v4.3.0 as a target and declares the display unconditionally).

So a display type newer than the oldest supported release is a **staging-only**
config change until it ships in `latest` — see below. It is also the one kind of
content change `check-config-compat` cannot catch on its own, because the fatal
needs the track to be **opened**: the probe loads a config and a session, and a
track nothing opens hydrates clean.

`pnpm check-config-compat` loads the shipped configs into every hosted release
and fails when one breaks; run it before shipping regenerated configs. The
support floor is the oldest version in its `HOST_VERSIONS` list. Reach for a
staging sibling (above) only when losing the new content on old hosts is itself
unacceptable — not as routine protection. Full reasoning, including why the
config urls are deliberately **not** versioned:
`agent-docs/architectural-decision-records/0002-config-compat-across-jbrowse-versions.md`.

### Three places this is checked, because the breakage comes from elsewhere

The plugin bundles are published from **another repo** (jbrowse-plugin-list
rehosts them to jbrowse.org/plugins, and `latest/` is uploaded no-cache so a
publish reaches configs shipped months ago). So a config that booted yesterday
can be an error page today with nothing pushed here — push-triggered CI
structurally cannot see it. Hence:

- `pnpm check-plugin-urls` — seconds, no browser. Every `plugins[].url` the
  configs name: reachable, javascript, and actually defines
  `JBrowsePlugin<Name>`. Runs in `lint.yml`. It canNOT see a bundle that loads
  and then throws from `configure()`, which is also fatal.
- `.github/workflows/config-canary.yml` — cron, every 6h, boots production on
  the whole version matrix and files one rolling `config-canary` issue. This is
  the layer that catches a throwing plugin. A failure must survive a retry
  before it alerts, because a canary that reports CDN blips gets muted. The
  support floor is **v4.0.0**: pre-v4 hosts were dropped from `HOST_VERSIONS` on
  2026-07-30, having been broken already (v2/v3 could not load the MsaView
  bundle at all; v3.7.0's mobx-state-tree rejects a FeatureTrack union in the
  config content). The oldest entry in `HOST_VERSIONS` is therefore the floor
  again, and no `--floor` override is needed.
- `run.sh` gates the upload on `check-plugin-urls` +
  `check-config-compat --local` before either `uploadAll.sh` runs. `--local`
  serves the working-tree configs to the real hosted app via request
  interception, so an unpublished regeneration is tested before it becomes
  public. `SKIP_CONFIG_GATE=1` overrides.

`--plugin Name=path` does the same substitution for a candidate plugin build, so
"does this bundle error-page the app" is answerable before publishing it rather
than after. Use it on every hubs/msaview/protein3d build that these configs
name.

2026-07-29 is why all of the above exists: `@cmdcolin/jbrowse-plugin-hubs` 1.0.9
began calling `appendToMenu('File')`, which every released core rejects (the
File menu is a thunk; `menuItems.push` throws), and hg38/hg19/mm39/hs1 were
error pages on v4.0.0 through latest. `check-plugin-urls` passed the whole time
— the url was fine.

## Assembly sidecars are mirrored on UCSC only, and all three of them matter

A **UCSC golden-path/hub** assembly's `chrom.sizes`, `chromAlias` and `cytoBand`
are copied next to the `config.json` that names them and referenced relatively,
so a UCSC outage costs the sequence track (the 2bit is still hgdownload's)
instead of the whole session. The reason it is all three and not just
`chrom.sizes`: jbrowse-core's `assembly.loadPre()` fetches sequence regions,
`refNameAliases`, `cytobands` and genetic codes in one `Promise.all`, and **any
one rejection fails the entire assembly** — which is why a UCSC outage read as
"the app won't load" rather than "a track is missing".

`hubtools/src/mirrorSidecars.ts` owns the rewrite;
`ucsc2jbrowse/src/mirrorAssemblySidecars.ts` drives it (local-first: chrom.sizes
from `chromInfo.txt.gz`, cytoBand copied straight from `database/`, so only
chromAlias is fetched). It sweeps every assembly every build, because a
regenerated config comes back naming upstream urls. A sidecar that can't be
fetched is left pointing upstream and retried next run. It is one of the steps
in `src/buildConfigs.ts` (above), and must run **after**
`ensureAssemblyAliasesAndCytobands`, which is what adds the `refNameAliases` and
`cytobands` urls it mirrors.

**GenArk is deliberately not mirrored** — it was, briefly, and was reverted on
2026-08-05. The UCSC sweep is 400 objects; the same sweep over GenArk was
**101,384 objects and 17.6GB** in the bucket, plus 50,700 rewritten configs
churning the git tree and a CloudFront invalidation on every run. It is the
object count that decides it, not the bytes — a fragmented assembly's chromAlias
is megabytes on either side.

GenArk configs therefore still name `hgdownload.soe.ucsc.edu`. **Two** sidecars,
not the three above: a GenArk hub has no cytoBand, so its assembly node carries
`chromSizes` and `refNameAliases` and nothing else (measured over a 403-config
sample of the 50,701 — chromSizes on every one, refNameAliases on all but one,
cytobands on none). Both being remote is exactly why a UCSC outage takes a
GenArk assembly down whole rather than costing it a track: `loadPre()` needs the
sequence regions and the aliases in the same `Promise.all`.

That is the accepted trade: don't "fix" it by re-enabling the sweep. Note also
that nothing checks those ~101k urls — `check-sidecar-urls` is UCSC-only on
purpose, because probing them in bulk is the road back to the sweep — so the
`mpxvRivers` failure mode (a config naming a sidecar that 404s, unopenable in
production, invisible to every gate) is unguarded on the GenArk side. See the
amendment in ADR 0003 for the options if it needs revisiting;
`hubtools/src/mirrorSidecars.ts` is deliberately kept as the library a future
GenArk pass would be rebuilt on, which is why it lives in the shared package
despite having only one caller today.

A sidecar whose upstream url **404s** is removed from the config rather than
left pointing at a dead url — `refNameAliases` and `cytobands` only, since those
nodes are optional and an assembly without one loads fine while one naming a 404
does not. `chromSizes` is never dropped (nothing here demonstrates TwoBitAdapter
accepts its absence back to the v4.0.0 floor). The 404/transient distinction is
load-bearing: a timeout or 5xx must leave the url alone, or an hgdownload blip
would delete a working alias file that nothing would then name to fetch back.
`pnpm check-sidecar-urls` is the pre-upload guard, in `gate_configs` beside
`check-plugin-urls` — it is what would have caught `mpxvRivers`, which named a
`chromAlias.txt` that 404s and was unopenable in production while
`check-plugin-urls` and the canary both passed.

It also enforces **outage-independence**, which is a stronger property than
reachability and the reason the mirroring exists at all. `MUST_BE_LOCAL` in that
script (`hg38`, `hg19`, `mm39`, `mm10`, `hs1`) may not name an upstream sidecar
even when upstream answers: a config that regressed to
`hgdownload…/hg38.chrom.sizes` passes every reachability check while UCSC is up,
and the protection is silently gone until the outage that needed it. Mirroring
is one step in `buildConfigs.ts`; if it throws or leaves `STEPS`, this is what
notices. Other assemblies are reported rather than failed, because a sidecar
whose fetch failed is deliberately left upstream and retried next run — making
that fatal everywhere would turn one blip into a blocked deploy.

As of 2026-08-05 all 235 real UCSC assemblies are fully mirrored; the only
upstream `chromSizes` were `cb1` and `hgFixed`, both of which 404 — dismissed at
the time as "not assemblies", which is exactly the reasoning the section below
takes apart. For hg19/hg38 specifically, all three sidecars are served from our
bucket and verified live, so `loadPre()` touches only jbrowse.org — a UCSC
outage costs the sequence track (the 2bit is still theirs, too big to mirror)
and the individual tracks that name hgdownload, but the assembly still opens.

Two things that will bite a change here:

- `chromSizes` is a **bare string** on TwoBitAdapter, not a `{ uri }` node, so
  anything that rewrites relative locations has to name it explicitly —
  `mergeAll.ts` does, or `all.json` would resolve it against `/ucsc/`.
- Relative is safe back to the v4.0.0 support floor only because jbrowse-web
  stamps `baseUri` beside the adapter's `uri` and TwoBitAdapter's
  `preProcessSnapshot` forwards it to `chromSizesLocation`. Full reasoning:
  `agent-docs/architectural-decision-records/0003-mirror-assembly-sidecars.md`.

## Track data files get the same treatment, on a request budget

`pnpm check-track-urls` (`scripts/checkTrackUrls.mjs`) is the sidecar check's
sibling for the other several thousand references: track adapters, their tabix
indexes, multiWig subadapters, the sequence 2bit. A dead sidecar costs a whole
assembly, which is why `checkSidecarUrls.mjs` fails the deploy; a dead track
file costs one track, which is exactly why nothing watched them and three broke
for months. All three were invisible to every existing layer —
`check-plugin-urls` looks at plugins, and `check-config-compat` hydrates an
unopened broken track perfectly cleanly:

- **`rn3-refseq`** named `goldenPath/rn3/bigZips/rn3.2bit`, which does not
  exist. rn3 is nib-era (`nibPath: /gbdb/rn3/nib`), UCSC never built it a
  bigZips 2bit, and its real one is at `/gbdb/rn3/rn3.2bit`. `createAssembly.ts`
  derived the url from a template and never asked whether it resolved — no
  caller checked assembly-node urls at all. It now probes bigZips, falls back to
  `/gbdb`, and keeps bigZips on a _transient_ failure so a blip cannot rewrite a
  good config.
- **`hg38-promoterAi{A,C,G,T}`** named `/gbdb/hg38/_promoterAi/{a,c,g,t}.bw`, a
  directory hgdownload does not publish. `checkIfFileAccessible` ran on
  `.bb`/`.bigBed`/`.bigMaf` only, so the same composite's `overlaps.bb` was
  caught (it is in `blockedFiles.json`) and the four bigWigs beside it were not.
  The check now runs on every branch: whether a file exists has nothing to do
  with its extension.
- **`hg38-cactus447way`** shipped as
  `https://hgdownload.soe.ucsc.eduhttps://hgdownload-test.gi.ucsc.edu/…` — a
  trackDb `bigDataUrl` naming a full url on a _different_ host, concatenated
  onto the base because the guard asked `startsWith(baseUrl)` rather than "is
  absolute". `resolveBigDataUri.ts` is now the one copy of that rule, which
  `buildBigMafTrack.ts` had always had right and `mergeBigFileTracks.ts` had
  wrong.

Three properties of `checkIfFileAccessible` are load-bearing, and each was
broken in turn:

- **The caller passes the assembly.** It used to guess with a regex over seven
  families (`hg\d+|mm\d+|dm\d+|ce\d+|sacCer\d+|danRer\d+|hs\d+`) and return
  `true` _unchecked_ for anything that missed — most of the 238. rn3, galGal6,
  bosTau9 and wuhCor1 were never probed.
- **Only a 404/410 counts as blocked.** `!response.ok` treated a 5xx as "the
  file is gone", recorded it, and then declined to re-check for 90 days. One
  hgdownload wobble mid-run would have stripped tracks off every assembly it
  touched and kept them off for a quarter. A timeout or 5xx now keeps the track
  and caches nothing. `checkIfFileAccessible.test.ts` pins this.
- **But a transient answer is asked again**, three times, before it counts as
  one. "Keep the track, cache nothing" is right for a stalled hgdownload and
  wrong for a blip, and one attempt could not tell them apart: on 2026-09-13
  hg38's `alphaGenome` composite lost a single `TypeError: fetch failed` on
  `/gbdb/hg38/_alphaGenome/a.bw` while `c.bw`, `g.bw` and `t.bw` beside it
  answered 404 in the same second, so the one file of the four that upstream
  does not publish is the one that kept its track — the promoterAi shape again,
  from the opposite direction. Nothing was cached either, so the config shipped
  a 404 that only the budgeted canary would have found, weeks later. A
  definitive answer (any 4xx but 408/429) still costs exactly one request; only
  the failing path retries.

### The budget is the point, not a limitation

hgdownload is a research file server and the same host our users pull from. A
full sweep is 5,484 distinct urls, so the default is **not** a sweep: a
`--budget` of 300 per run spent oldest-first, `--rps 1`, and a state file
(`ucsc2jbrowse/.trackUrlCheck.json`, gitignored) that rests a url for `--ttl` 30
days once it answers. Never-checked urls sort first, so a config regenerated
yesterday is probed tonight while the stable corpus rotates behind it over ~3
weeks. What the budget skipped is always printed — a cap reporting "all clear"
over an unchecked corpus is worse than no check.

That default came out of measurement, and the measurement is worth keeping
because the conclusion is _not_ the obvious one. One unthrottled sweep at
concurrency 14 completed (5,474/5,484 answered), and minutes later hgdownload
stopped serving this host in a very specific way: **the TCP handshake still
completes in ~120ms, the TLS Client Hello goes out, and no Server Hello ever
comes back**, while hgdownload2 and genome.ucsc.edu answered normally. That is
the signature of an exhausted worker pool, _not_ of an IP block — a block drops
SYNs or sends RST. But a connection-limiting module stalls identically, and from
one vantage point there is no distinguishing "we exhausted it" from "it is
exhausted for everyone". So do not record this as proven throttling. The budget
is what makes the question moot: at 300 requests a day nothing here can be the
cause, and the canary stays a canary instead of a suspect.

It recovered on its own ~15 minutes later with nothing done from this end, and
recovered _gradually_: the first success completed its TLS handshake in
**6.9s**, against 1.0s before the sweep and 0.2s on hgdownload2. A policy block
does not ease back in over seconds of handshake latency; a saturated server
does. So the weight of the evidence is on general overload rather than on us
being singled out — which is a better reason to stay small, not a lesser one.
Overload is the condition these configs live in permanently.

Worth knowing for its own sake: hgdownload failing by _stalling_ means client
timeouts rather than fast errors, so a session pointed at it hangs instead of
reporting a broken track.

### Where it runs, and why the two places check different things

- **`run.sh`'s `gate_configs`** runs `--offline`, which fetches nothing. It
  verifies only the _relative_ refs — those name our own bucket, so it is an
  on-disk existence check that catches a config about to name a file we are not
  uploading. `--offline` **errors without a built dir** rather than passing
  vacuously, since relative refs are all it can check.

  Which is exactly how it failed on 2026-08-26, the first time it ever ran:
  `UCSC_BUILT_DIR` is exported by `ucsc2jbrowse/common.sh`, and **run.sh does
  not source that file** — it sources `lib/common.sh` and runs `make.sh` as a
  subprocess — so the gate saw no built dir at all. `checkSidecarUrls.mjs` had
  survived the same hole by hardcoding the path. Both now resolve it through
  `scripts/builtDir.mjs`, which takes an explicit `--built-dir`/env as given and
  falls back to the built-in default **only when it exists**: CI has no built
  tree, and a default that hard-errored there would take the daily canary down.
  run.sh also distinguishes the check's exit 2 (could not run) from exit 1
  (found a broken ref) — reporting the first as the second is what made this
  cost an afternoon.

- **`.github/workflows/track-url-canary.yml`**, daily at 04:20 UTC, does the
  budgeted network rotation and files one rolling `track-url-canary` issue. It
  needs no retry-before-alerting (unlike `config-canary.yml`) because 404 and
  transient are already separated: only 404/410 reach the exit code. Its
  rotation state lives in the actions cache, and a cache miss costs a restarted
  rotation, not a wrong answer.

`hgdownload2.soe.ucsc.edu` is used for one narrow purpose: when the primary
fails, the same path is tried there, and if the mirror serves it the finding is
reported as **primary-only** rather than as a dead reference — deleting the
track would be the wrong fix. Verified 2026-08-25 as a byte-identical drop-in
for both `/goldenPath/` and `/hubs/` paths, `Accept-Ranges: bytes` and
`Access-Control-Allow-Origin: *` on both, from a different UCSC address block
(169.233.10.x vs 128.114.119.x). Nothing in the shipped configs names it, and
only failures reach it, so it adds no load in the normal case.

`myfetchtextWithRetry` (`hubtools/src/util.ts`) is the second such use, and it
is what the hub-backed configs are built through: each of its three rounds asks
the mirror as well as the primary. On 2026-09-06 hgdownload **refused**
connections for a few minutes (`ECONNREFUSED` on 128.114.119.163:443 — an
immediate refusal, not the stall documented above), rn8's live `hub.txt` fetch
lost all three attempts inside the ~6s the backoff spans, and one flaky fetch
exited the whole config build. Only the **text** comes from the mirror — the
caller keeps naming the primary in the `trackDbUrl` it writes — so a fallback
cannot put hgdownload2 in a published config.

Two things about it moved on 2026-09-09, and the first is why the mirror was
never reached during the outage it exists for. **`myfetch` had no deadline.**
node's fetch has none of its own for a connection that completes and then goes
quiet — measured on node 24.2.0 against a socket that accepts and never answers,
a bare `fetch` was still hanging at 45 seconds — so during a stall the first
attempt never returns, the retry never happens and the mirror is never asked.
`FETCH_TIMEOUT_MS` (60s, exported from `hubtools/src/util.ts`) is now the one
number for every fetch in either pipeline: `mirrorSidecars`' downloader,
`checkIfFileAccessible`'s HEAD, `addGeneticCodes`' eutils and chrom.sizes calls,
`processUcscList`, the Wikipedia and Wikidata lookups. `checkPluginUrls.mjs`
carries its own 30s copy, being outside the workspace's dependency on hubtools;
`checkTrackUrls.mjs` and `checkSidecarUrls.mjs` already had theirs.

**And it no longer retries a definitive answer.** `myfetch` throws an
`HttpError` carrying the status, and a round ends the loop only when _every_
host answered definitively — a mirror 404 while the primary is unreachable is
not evidence the file is gone. A retired hub cost 6 requests and 6s of backoff
to be told the same thing three times; it now costs 2 and no backoff. 408 and
429 stay transient, being the two 4xx that mean "ask again".

### What the gate caught once it could run

Three broken references across the UCSC configs, all invisible to every other
layer and each a different shape:

- **`criGriChoV1-xenoRefGene` named a `.csi` that was never written.** The 80MB
  `xenoRefGene.gff.gz` was fine; `tabix -C` had refused it with
  `Invalid record on sequence #7587: end 1 < begin 4294967295`. One GFF line out
  of millions, and the cause is a `u32` underflow in **bed2gff**: `last_codon`
  computes `max(cds_start, cds_end - 3)`, which wraps for a CDS ending within
  3bp of the contig start — criGriChoV1's xenoRefGene alignment of NM_207404 is
  truncated at scaffold NW_003684908v1's edge, `cdsStart=0 cdsEnd=1`. What made
  it reach the file rather than being caught is that the **same wrap passes the
  completeness gate**: `codon_complete` computed `1 - 4294967294`, which wraps
  to exactly 3. So `cds_end.saturating_sub(3)` alone is not the whole fix —
  `codon_complete` uses `checked_sub` now, so an inverted interval is refused
  rather than laundered into a valid-looking length. `bed2gff/src/codon.rs` has
  all three cases pinned.

  Note the failure mode, because it is the general one here: the pipeline
  produced a file it could not index, `run_for_assemblies_lenient` warned and
  moved on, `needs_rebuild`'s stamp was never written so every later run redid
  the same broken work, and the config shipped naming an index that did not
  exist. That warning said only "parallel reported failures (exit 1)" — a count
  hides a systematic breakage exactly as well as it hides a one-off, so both
  assembly runners now go through a `--joblog` and name the assemblies that
  failed, the way `run_parallel_reporting` has always done for the genark
  sweeps. Nothing in the tree asked "did the index get written". The cheap
  whole-tree version of that question is worth keeping in mind:
  `find $UCSC_BUILT_DIR \( -name '*.gff.gz' -o -name '*.bed.gz' \)` and check
  each for a `.csi`/`.tbi` beside it — 5,793 files, seconds, and as of
  2026-08-26 all of them have one.

  That sweep is also why `.derivation_hash` was **advanced by hand** on
  2026-08-26 (`1e38bbbeb16ba674` → `9a0a9f50214e5de1`) instead of letting the
  fix re-derive all 238 assemblies, and the reasoning is the part to keep: a
  wrapped record makes tabix reject the _whole file_, so any output the fix
  would change necessarily has no index. Every one of the 5,793 had an index
  once criGriChoV1 was rebuilt, and bed2gff feeds only the gene tracks — so
  re-deriving would have reproduced byte-identical output everywhere, for hours.
  Advancing the stamp is only ever sound with an argument of that shape,
  covering the whole corpus rather than a spot check; absent one, take the
  re-derivation.

- **`cb1-*` and `hgFixed-*`**, `Gff3TabixAdapter` on a literal `*.gff.gz`: the
  residue of a shell loop that ran with nullglob off over a directory with
  nothing to match. The shell adder grew its `shopt -s nullglob` long ago
  (`addDerivedTabixTracks` reads the directory now), but **a fix at the source
  only reaches a config that is regenerated**, and neither of these two ever was
  — `is_assembly_db` excluded both from every derivation pass, so their
  `tracks[]` was frozen from 2025-05-13 and no amount of rebuilding would have
  cleared it. Finalization is the one pass that did visit them, so
  `dropGlobTracks` (in `buildConfigs.ts`'s `STEPS`, ahead of the tail that reads
  `tracks[]`) is both the cleanup and the standing guard: a glob character in a
  location is never a key our bucket has. Both exclusions are gone now (below),
  which retires the cleanup and not the guard — the next forgotten nullglob
  would ship through an ordinary regeneration.

### "Not a real assembly" was excusing a url we publish

The canary's next two findings were `cb1`'s 2bit and `chrom.sizes`, both 404,
reported nightly from 2026-08-28. Three earlier places in this file had already
written that pair off — "the only assemblies whose `chrom.sizes` 404s are
`hgFixed` and `cb1`, which `is_assembly_db` already knows are not assemblies" —
and the dismissal was the bug.

**`cb1` is an assembly.** It is an active entry in the live UCSC genome list
(nib-era C. briggsae, July 2002, one 108Mb `chrUn`), with a browser, a trackDb
and a 2bit at `/gbdb/cb1/cb1.2bit` — the same `/gbdb` shape
`resolveSequenceFile` already finds for rn3. It had been skipped since the
pipeline's first commit (`downloadGoldenpath.sh`, `if [ "$p" = "cb1" ]`) with no
reason recorded then or since. Skipping it never stopped us **publishing** it:
the copy step takes the genome list's own keys, `transformGenomeList.ts` stamps
a `jbrowseConfig` url on every entry unconditionally, and
`website/src/list.json` is what the `/ucsc` table renders — so
`genomes.jbrowse.org/ucsc/cb1` was an advertised browser naming a `bigZips` 2bit
and `chrom.sizes` that have never existed. `loadPre()` rejects on either, so it
did not open at all, for a year.

**`hgFixed` is not**, and that is why its config is gone rather than fixed: it
is UCSC's shared metadata database (make.sh rsyncs it for `asmEquivalent`, which
is all it is for), it has no sequence, and it was only in `configs/` because the
copy step appended it by name. Nothing has ever linked to it — every page and
the hubs plugin resolve a genome through the list it is absent from — so this is
a retirement with no reader to strand, unlike the permanent urls
`check-orphan-configs` deliberately refuses to clean up on its own. The
"genome-list keys plus `hgFixed`" rule is now just "genome-list keys", in all
walks that carried it (make.sh's copy step, `buildConfigs.ts`), and
`checkOrphanConfigs.mjs`'s `EXTRA_NAMES` allowance is gone with them.

So `cb1` builds like any other golden-path assembly, and nothing about that is
special-cased: `createAssembly.ts` probes `bigZips` and falls back to `/gbdb`,
and `mirrorAssemblySidecars`'s `provideLocal` hook derives `chrom.sizes` from
the rsynced `chromInfo.txt.gz`, so both 404s go away for the ordinary reason.
Its first `make.sh` sees no `.trackdb_hash` and processes it whole.

Two things the source change alone does not do, both on the build box.
`configs/cb1.json` is only correct once it is **regenerated** — the committed
config still names the dead urls until a run copies the rebuilt one over it, and
the canary reads `ucsc2jbrowse/configs/`, not the source. And
`$UCSC_BUILT_DIR/hgFixed/` still holds the config nothing copies any more;
deleting that directory is what makes the next `uploadAll.sh` drop
`/ucsc/hgFixed/` from the bucket, and until then a
`check-track-urls --built-dir` run still sees its two 404s.

The generalizable half is the shape of the excuse. "It is not a real assembly"
was a claim about **our processing**; what it was excusing was a claim about **a
url we publish**. Those are different questions, and nothing in the pipeline
asks the second one — which is why a config that could not open survived every
gate here until a daily 404 report said so out loud.

### A canary that fails on a permanent finding stops rotating

The same issue was the only thing anyone had seen for three nights, and that was
the second bug. `checkTrackUrls.mjs` is budgeted — 300 urls a run, oldest-first,
the rest of the ~5,500 rotating behind them over ~3 weeks — and the rotation
lives entirely in the `ucsc2jbrowse/.trackUrlCheck.json` that
`track-url-canary.yml` carries in the actions cache.

`actions/cache` declares **`post-if: success()`**. This job fails on purpose
whenever it finds a 404. So from the first permanent finding onward the state
file was never saved: every run restored the same pre-failure snapshot,
re-probed the same first 300 urls, re-reported the same finding, and saved
nothing. Three consecutive nightly comments carried byte-identical counts —
`600 answered OK … 300 to probe … 4602 deferred` — which is what the frozen
rotation looks like if you happen to compare two of them. The other 4,602
references had gone unchecked since the day the first finding landed.

It is now `actions/cache/restore` plus `actions/cache/save` with `if: always()`.
Whatever the probe concluded, it spent the requests and the answers are what
advance the rotation; a finding must not cost them. Worth checking in any
workflow that pairs a cache with a deliberately failing step — the failure mode
is silent in exactly the way the cached thing was supposed to prevent.

Unfreezing the rotation exposes the bug the freeze was hiding, which is why the
two go together. The exit code opens **and closes** the canary's issue, and it
can only speak for the urls that run probed — the script says so itself ("no
findings means none among the 300 probed"). So once the rotation moves past a
known-broken url, the next night finds nothing among its own 300, exits 0, and
the workflow closes the issue with "every probed reference resolves again" while
the config still names a 404. `checkTrackUrls.mjs` therefore **carries every url
last seen `gone` outside the budget**, re-probing it every run: re-confirming a
404 is two requests, and the size of that set is how many broken references we
have not fixed yet, which is a number we control. Verified by hand on 2026-08-30
against cb1's two: with `--budget 5` they are re-checked and reported, and the
run still fails.

### Whether the file is complete is a different question from whether it exists

`pnpm check-tabix-indexes` (`scripts/checkTabixIndexes.mjs`, in `gate_configs`)
requires a `.csi` or `.tbi` beside every derived `.bed.gz`/`.gff.gz`. Local
walk, no network, so **GenArk is in scope here** unlike the two url checks —
both trees, 50,476 files, 0.6s, all clean as of 2026-08-28.

This is the one place make's model is genuinely better than a shell pipeline's,
and it is worth stating plainly: make's unit of work is the target file, so "the
recipe ran" and "the thing it was supposed to produce exists" are the same
question. Here they are two, and nothing asked the second one. criGriChoV1 is
the shape — `tabix -C` refused an 80MB gff.gz, `run_for_assemblies_lenient`
warned and moved on, and the config shipped naming an index that was never
written. `checkTrackUrls.mjs` eventually caught it by probing urls; this catches
it on disk, before the upload.

`save_rebuild_stamp` (`lib/common.sh`) closes the other half at the point of
derivation: it now takes the **output** as well — argument order matching
`needs_rebuild`, since the two are always a pair — and refuses to stamp when
that output is missing or empty. A recipe that exits 0 having written nothing
would otherwise be recorded as done and skipped by every later run, which is the
durable half of the failure.

Presence only, deliberately. A fresh `.gz` against an _older_ index is the other
shape worth fearing (it is what the bucket held during the bgzip backend swap,
and reads as `invalid bgzf header` rather than as a missing file), but mtime
cannot detect it: 72 of the 5,856 UCSC files have an index whose mtime precedes
the data by up to **0.05 seconds**, which is bgzip and tabix finishing inside
one filesystem timestamp. A tolerance big enough to absorb that would absorb a
real stale index too. What defends that shape is `assert_bgzip_toolchain` (the
cause) and `rclone_sync_with_indexes`' ordering (the exposure).

### The other half again: a `.gz` with an index and no records

`save_rebuild_stamp` refuses an output that is missing or empty, and
`check-tabix-indexes` requires an index beside it. A **28-byte** `.gff.gz` — the
BGZF end-of-file block and nothing else — satisfies both, and four of them had
been shipping since 2026-06-03, each with a `.hash` recording it as built and a
source table full of rows: `galGal2` xenoRefGene (438,401 of them), `hg16`
encodeEgaspFullGenemark, `hg16` pseudoYale, `tetNig1` hoxGenes.

What broke them is UCSC's own data, in two shapes, both of which stop `bed2gff`
dead — and a failing derivation costs not just its own track but every gene
track after it in that assembly, since `process_assembly` in
`createGeneTracksForGoldenPath.sh` runs under `set -e`:

- **Exons that run backwards.** 9 of galGal2's xenoRefGene rows have an
  `exonEnds` entry behind its `exonStarts` partner (`NM_017037`'s seventh exon
  is 2176615..2176258), which becomes a negative BED block size that
  `BedRecord::parse` refuses — `Cannot parse field`, and the message named
  neither the row nor the file. `geneLike.ts` drops such rows now and reports
  how many; the parse error carries the offending line.
- **Names with spaces in them.** hg16's `encodeEgasp*` tables put the GTF
  attribute verbatim in the `name` column — every transcript is
  `transcript_id "ENr231_1";` — and tetNig1's hoxGenes has a `CDS EVX-HOXA`. Two
  things split those on whitespace: `hck`, whose `--delimiter` defaults to
  `\s+`, so the isoforms file was built out of the wrong columns entirely, and
  bed2gff's `parallel_hash_rev`. The transcript then matches nothing in the
  isoforms map and `resolve_genes` exits 1. Both split on tab now. That name
  also lands in GFF3 column 9, where its `;` would end the attribute, so
  `writer.rs` percent-encodes the reserved set — a value without one is written
  through untouched, which is every ordinary gene in the corpus.

The gap that let this last three months is the section above, one step further
in: nothing asks whether a derived file holds any **records**. `find` over the
built tree for `-size -100c` is the cheap version of that question, and it is
how these four were found.

All three fixed files are in `DERIVATION_SOURCES`, so the next run re-derives
every gene track on all 238 assemblies. Only the handful of files described here
can come out different — but "byte-identical everywhere else" is an argument
about names and coordinates across the whole corpus, and nobody has run that
scan, so take the re-derivation rather than advancing `.derivation_hash` by
hand.

### A post-processing step with no gate is where over-invalidation gets expensive

`PIPELINE_SOURCES` being broad is the right trade _because_ a reprocess is cheap
on a warm tree — every per-file derivation is `needs_rebuild`-gated.
`addGeneticCodes.ts` was the exception, with no gate at all, and now runs for
every assembly on every config build, so without a cache each run would cost a
full round of NCBI eutils queries **plus one `chrom.sizes` fetch per assembly
from hgdownload** — unbudgeted, against the same host `check-track-urls` is held
to 300 requests a day against.

`src/mitoCodes.ts` restores the invariant, and the second half is the
non-obvious one:

- **The taxId → mito code answers are cached** (`ucsc2jbrowse/.mitoCodes.json`,
  gitignored, 180-day TTL). Negatives are cached too: `null` means "NCBI
  answered and this taxon has no MGCId", and without it every such taxon is
  re-queried forever. Only taxa in a chunk NCBI actually **served** may be
  cached as negative — caching a failed request as an answer would suppress the
  genetic code until the TTL expired.
- **`chrom.sizes` is read from the mirrored sidecar already on disk.** This step
  runs before `mirrorAssemblySidecars` in `buildConfigs.ts`, and the config is
  rebuilt from scratch on every run — so at that point it names the upstream url
  again _even though the previous run's mirrored file is sitting right next to
  it_. Only `config.json` is rebuilt; the sidecars are not.
  `localChromSizesPath` asks `mirrorSidecars` for the naming rule rather than
  keeping a second copy of it.

Measured 2026-08-28 on hg38 and dm6, configs restored to their pre-finalize
shape: cold cache 2 NCBI queries and **0** hgdownload fetches; warm cache 0 and
0, with both configs reported already current. The run summary prints those
counts, because a silent regression to fetching would otherwise look identical.

Two scope decisions to leave alone. **Track prose is out of scope**: the configs
carry UCSC's trackDb html, which links ncbi, ebi, ensembl and a long tail of lab
pages — ~700 urls that are documentation, and a rotted citation is not a broken
track. **GenArk is out of scope**, for the reason the sidecar check is: 50,703
configs naming ~150k upstream files, and probing them in bulk is the road back
to the reverted mirroring sweep.

### Readers get told, because a stall reports nothing on its own

`UcscStatusBanner` (`website/src/components/UcscStatusBanner.astro`, wording in
`website/src/lib/ucscStatusBanner.ts`, probe in
`website/src/lib/ucscLiveness.ts`) warns on the launch pages when hgdownload is
not answering. It exists because the stall described above is **completely
silent to the reader**: jbrowse-core sets no timeout on those fetches, so
nothing rejects and nothing is reported. A track sits on a loading spinner
forever, and `loadPre()`'s `Promise.all` never settles — the browser is "still
loading" indefinitely with no way to learn that a server elsewhere is the
reason.

The real fix is in the session, and it is **not reachable from this repo**: the
hang lives in the hosted jbrowse-web build and in
`@cmdcolin/jbrowse-plugin-hubs`, and a fix in either would not reach the pinned
older hosts our permanent config urls still serve. So this warns one step
earlier, on the page the reader launches from. Treat it as a consolation prize,
not the cure — the cure is a fetch deadline in core or in the Hubs plugin, which
every one of the UCSC configs loads.

**It measures a difference, not a timeout.** A dropped wifi link times out
against hgdownload exactly as a stalled hgdownload does, and so does a tracking
blocker or a corporate proxy; `navigator.onLine` reports the interface, not
whether packets arrive. So each probe is two parallel bodiless HEADs —
hgdownload's `hg38.chrom.sizes` and a same-origin control (`/favicon.ico`) — and
only the combination is evidence. Control slow or failing ⇒ `unknown`, say
nothing. Control fast + UCSC timeout ⇒ `stalled`. Control fast + UCSC over 2.5s
⇒ `slow`. Anything else ⇒ nothing. A non-timeout error status is deliberately
`unknown` too: a 5xx is upstream having a bad day, and describing it as the hang
would describe the wrong failure. `ucscLiveness.test.ts` pins every one of those
branches, the false-alarm ones especially.

Four things not to undo:

- **The probe's hard deadline.** The failure being detected is a connection that
  never answers, so a probe without `AbortSignal.timeout` would hang exactly
  like the thing it is diagnosing and the banner would never appear during the
  outage it exists for.
- **The banner names the consequence per arm, not just "UCSC is down".** A UCSC
  assembly still opens (its sidecars are mirrored) and loses the sequence track
  plus UCSC-served tracks; a GenArk assembly does not open at all, because its
  `chromSizes` and `refNameAliases` are both remote and both in that same
  `Promise.all`. That distinction is the actionable part.
- **Mounted only on pages a reader launches from** (`accession/[id]`,
  `ucsc/[id]`, `ucsc/index`, `hubs/[slug]`, `taxonomy/[slug]`, `search` and the
  recently-updated pages), probing when the browser is idle, with the verdict
  shared across tabs and page views in `localStorage` for 2 minutes. Cost to
  UCSC therefore scales with distinct readers per window rather than with page
  views, and one bodiless HEAD is a rounding error beside the hundreds of range
  requests the session that reader is about to launch makes against the same
  host. Putting it in `Layout.astro` would be simpler and would probe from the
  blog.
- **A plain script, not a React island.** On the accession and `/ucsc/<db>`
  pages the banner was the only island, so it shipped React to them: measured
  2026-09-24 on an accession page, 77 KB of gzipped JavaScript (65 KB of it
  `react-dom`) plus 4.7 KB of inline island runtime in each of ~52,000 pages'
  HTML, for a warning that almost never shows. The header search, the page's
  only other script, is 2.2 KB.

### And one level down again: the compressor is not in any hash

`source_tree_hash` covers the repo's code. It does not cover the **toolchain**,
and the bytes a derived `.gz` holds are a function of the bgzip build as much as
of the converter. htslib 1.23.1 linked against libz emits ~6% larger output than
the same version linked against libdeflate, and the _decompressed_ content is
byte-identical — so every check here passes either way.

On 2026-08-27 a `~/.local` htslib upgrade (installed Aug 2, linking libz where
`/usr/bin`'s htslib 1.13 links `libdeflate.so.0`) swapped the backend silently.
The next `REDERIVE` rewrote **5,757 files / 76.7 GB** with no content change,
`rclone -c` correctly saw different bytes and re-sent all of them, and because
`rclone_sync_with_indexes` is two passes the run left fresh `.gz` against stale
`.csi` in the bucket for every assembly it reached — `invalid bgzf header` on
hg19 and hg38 in production, traced to nothing anyone had pushed.

`assert_bgzip_toolchain` (`lib/common.sh`, called from both `make.sh` before any
derivation) pins the property that matters: **the bytes bgzip emits**, compared
against `BGZIP_TOOLCHAIN_SIGNATURE`. Three things about it are load-bearing:

- **Not a version string.** `bgzip --version` read `1.23.1` before and after the
  swap. A version check would have caught nothing.
- **The canary input is 2.4 MB of varied bed-like data, deliberately.** A short
  input hashes _identically_ under htslib 1.13 and 1.23.1 — both libdeflate,
  both disagreeing on real files (243,569 vs 242,051 bytes on the same bed) — so
  a trivial canary waves through exactly the drift this exists to catch. Cost is
  0.09s per run.
- **Fatal, not a warning.** The failure is invisible in the output and surfaces
  only as an unexplained multi-GB re-upload plus desynchronized indexes, which
  is precisely the shape a warning gets scrolled past. `ALLOW_BGZIP_DRIFT=1`
  accepts a deliberate change, which means committing the new signature and
  accepting that every derived `.gz` and `.csi` gets rewritten and re-sent.

The **guard** asserts the host; the **test** asserts the mechanism, and mixing
those up cost three test suites. `lib/common.test.sh` used to fail unless the
machine running it matched the pin — which no CI runner can, having no bgzip at
all — and because the workflow step was a plain list under `bash -e`, that took
`lib/chainpif.test.sh` and `genark2jbrowse/deriveGeneticCodes.test.sh` (then
named `addNcbiGffAndTextIndex.test.sh`) down with it, so neither had ever run in
CI. The suite now checks determinism, canary size, rejection of a different
build and the override, and _reports_ the host's own match unless
`BGZIP_STRICT=1` (worth setting on the build box). Nothing is lost: the
protection was never the test, it is `assert_bgzip_toolchain` being fatal in
both `make.sh` files before any derivation. The step also runs every suite and
fails afterwards, because one red suite must not hide the others.

Worth knowing if it ever fires: libdeflate levels are **not** comparable across
htslib versions, so no `-l` makes 1.23.1 reproduce 1.13 (l5→243,497, l6→242,051,
l7→239,062). Matching an existing corpus means matching the build, not tuning
the level. The corpus today is htslib 1.23.1 + libz, chosen for stability over
the 6% — file size was explicitly not the priority.

### The PIF corpus is keyed on the CLI that wrote it

Same shape one tool over: a PIF's bytes are a function of `jbrowse make-pif`'s
version as much as of the chain, and the format has now moved twice inside the
5.0 betas.

`5.0.0-beta.1` (2026-08-31) added a **coarse level-of-detail tier** beside the
per-row CIGAR tier — the same alignments under uppercase `T<chr>`/`Q<chr>`
refnames, split at indels ≥ 10 kb, which the v5 adapter probes for and switches
to at `coarseBpPerPxThreshold` (10,000 bp/px). A v4 adapter queries `t<chr>` and
never sees the uppercase rows, so a regenerated PIF ships to production without
a staging sibling. Measured on hg38→mm39: 33 s, 141.5 MB against 132.2 MB (+7
%), 80,845 fine and 121,175 coarse row pairs.

`5.0.0-beta.2` (bumped here 2026-09-02) changes the coarse tier from a
**re-segmentation** of the alignments into a **projection** of them, and makes
the file say so. Measured on hg38→mm39 (80,845 PAF records, the same `.paf` fed
to both):

- **A coarse row is now exactly its fine row without the CIGAR.** 80,845 coarse
  against 80,845 fine, and comparing (refname, start, end, strand, target start,
  target end) across the two tiers gives **zero** differing rows. beta.1 emitted
  121,175 coarse rows against the same 80,845 fine ones, of which 43,902 had no
  fine counterpart at those coordinates — so crossing `coarseBpPerPxThreshold`
  used to redraw the view as a differently-segmented picture. It no longer does;
  the two tiers now differ only in what they cost to read.
- A leading `#pif` header line, in PAF tag syntax:
  `#pif  version:i:1  tiers:Z:fine,coarse  coarse:i:10000  cigars:Z:all`, so the
  layout is declared rather than probed for. It is a `#` comment, so tabix and
  `--csi` skip it (verified: `tabix -l` and both `q…`/`Q…` range queries work on
  a regenerated file) and an old reader ignores it.
- Coarse rows lose the `de:f:` divergence tag, which beta.1 computed over the
  merged block.

Fine rows are byte-identical between the two betas, so the entire delta is the
header plus the coarse tier.

**The coarse tier is what a whole-genome view reads, and that is where the win
is.** On hg38→mm39, a whole-`chr1` query costs 12.8 MB at the fine tier against
**574 KB** at the coarse one — 22×; genome-wide the two tiers are 348 MB against
18.7 MB, 18.6×. Across all 57 regenerated dm6 liftOver PIFs the ratio is 13.7×.
The file is ~7 % larger for it (141.7 MB against the 132.2 MB of the pre-tier
4.2.1 build), which is the trade.

`make-pif` also got **2.5× faster** on the same input: 11.0 s against beta.1's
27.7 s.

The payoff is not uniform, and it is worth knowing which corpus you are looking
at. A coarse row saves only the bytes its CIGAR occupied, so an assembly whose
chains are short saves nothing measurable — regenerating **ce11** gave a 1.00
fine:coarse byte ratio on all six of its PIFs, and the files came back the same
size to within a percent. The mammalian and cross-phylum chains are where the
18× lives.

Two things hold the corpus current, both in `lib/chainpif.sh`:

- **The CLI is the repo's pinned `node_modules/.bin/jbrowse`**, not whatever
  `jbrowse` is on PATH (a global 4.2.1 was what built every existing PIF).
  `JBROWSE_CLI` in `lib/common.sh` is the one definition, and as of 2026-09-07
  **every** invocation in both pipelines reads it — see below.
- **Every PIF carries a `.cli` stamp** in the cache dir and every liftOver dir's
  `.checked` holds the same line (`jbrowse_cli_version`). `pif_current` and
  `pif_stamp_current` treat a missing, empty (the old `touch` format) or
  different stamp as stale, so a CLI bump rebuilds the corpus on the next run.
  The stamp records `jbrowse --version` verbatim, which is what makes it
  format-agnostic — beta.1 → beta.2 needed no code change here at all. The stamp
  lives only in `/mnt/sdb/cdiesh/pifs`, never beside the uploaded copy, so
  nothing new reaches the bucket.

The stamp comparison is also the genark liftOver **gate**, run once per hub over
all 52,722 of them, and that is what makes a `$(…)` in it expensive.
`jbrowse_cli_version` memoized into a global and was called as
`$(jbrowse_cli_version)` inside a `[ ]` — a command substitution is a subshell,
so the assignment was discarded every time and the gate forked a
`node jbrowse --version` **per hub**. Measured 2026-09-07: 24 ms a hub, **21
minutes** for make.sh to print
`Processing liftOver chain files and creating PIFs...` and then decide that all
52,722 stamps were already current and there was nothing to do.
`load_jbrowse_cli_version` assigns instead of echoing (and exports, so a
`parallel` child inherits rather than re-asks) and the stamp is read with `read`
rather than `$(cat)`: **1.0 s** for the same corpus. `chainpif.test.sh` pins the
count with a counting CLI stub, priming the memo by hand — calling
`write_pif_stamp` first would prime it for real and the test would pass against
either version.

### Only `make-pif` was on the pinned CLI; `sort-gff` and `text-index` were not

`JBROWSE_CLI` was defined in `lib/chainpif.sh`, which only the PIF path sources.
The other six invocations — `sort-gff` in `createGeneTracksForGoldenPath.sh`
(×2), `downloadGencode.sh`, `downloadNcbiGff.sh` and `processGffFiles.sh`, and
`text-index` in both `textIndex.sh` — called a bare `jbrowse`, which resolved to
whatever a global install happened to be. That was **4.2.1** while
`package.json` named **5.0.0-beta.2**, so every GFF in both corpora and every
trix index was written by a version no file in this repo pins, and a
`pnpm install` moved none of it. The definition now lives in `lib/common.sh`
(sourced by all of them) and `chainpif.sh` picks it up from there rather than
keeping a second copy of the path.

Measured 2026-09-07 before switching, because a version change to either tool
rewrites a corpus that nothing would otherwise regenerate — the bgzip lesson one
tool over:

- **`sort-gff` is byte-identical** between 4.2.1 and beta.2 on all five inputs
  tried (dm6 ncbiRefSeq/xenoRefGene, hg38 ncbiRefSeqCurated, the dm and human
  NCBI GFFs — 0.4M to 4.9M lines). So the GFF corpus is unaffected and no
  re-derivation is owed.
- **`text-index` differs, and only by dropping duplicate postings.** 4.2.1
  emitted a record once per occurrence of the term in it, so gene `dyw`, whose
  alias list reads `0.9 0.9 gene 0.9kb …`, appeared three times under `0.9`.
  Same terms (180,630 on the dm hub, 244,648 on dm6), same record set for every
  one of them — collapsing repeats makes the two files identical — and 11-12%
  smaller: 35.4→31.6 MB and 100.8→88.5 MB. It is also ~35% faster. A duplicate
  posting was never a second search result, so nothing about search changes.

The trix corpus is therefore left **mixed** on purpose: the gate is mtime (index
older than its GFF), a 4.2.1 index and a beta.2 index answer identically, and
re-indexing 50,000 hubs to save 11% of disk would re-upload every one of them.
New and regenerated indexes are beta.2's; the rest turn over when their GFF
does. That is a different call from the PIF `.cli` stamps, where the coarse tier
made old files functionally worse, not just larger.

A cached chain, by contrast, is never re-fetched — and one of them had been
truncated since 2025-06-14, 66,891,932 bytes of hg38ToFukDam1's 90,055,223, an
aborted download from before `download_file` grew its tmp+mv. Existence is all
the cache asks, so `pigz: corrupted -- incomplete deflate data` failed the same
job on every run for a year with no way to repair it. `chain_to_paf` now
separates a chain that will not **decompress** (exit 2) from one `chain2paf`
**refused** (exit 1) and `create_pif` re-downloads on the first only, so bad
chain content still fails loudly instead of looping on a fetch. Detection rides
the decompress the conversion already does: a `pigz -t` sweep would cost a
second full decode of all 585 GB to find whichever ones are wrong (only
hg38ToFukDam1 has failed so far, and the rest of the cache is unaudited — a
corrupt one now repairs itself the first time it is read).

The first run after a bump is therefore the regeneration: 4,068 UCSC PIFs (928
GB, chains cached in `/mnt/sdb/cdiesh/chains`) plus 750 GenArk, and `rclone -c`
re-sends all of it. Nothing about that is a mistake to be gated away — it is the
only way a format change reaches the files — but it is a run to start on
purpose. As of the beta.2 bump every stamp on disk reads beta.1 (and 1,913 of
the UCSC PIFs predate stamping entirely), so the whole corpus is already marked
stale and no `--reprocess` is needed to force it.

## Which UCSC assemblies are NCBI-derived is derived, not listed

A `<db>-ncbiRefSeqGff` track is the full-resolution NCBI RefSeq GFF3 — gene →
mRNA → CDS/exon with the real attributes — beside UCSC's own genePred-derived
`ncbiRefSeq` bigBeds. `downloadNcbiGff.sh` builds it, and until 2026-08-26 it
read a hand-written list of 11 dbs.

That list could only ever be stale, because the UCSC genome list is fetched
**live** on every `make.sh` run: a new assembly arrives with no repo change, and
so with no GFF. rn8 (GRCr8) is the case that showed it. It is a GenArk-backed
alias whose own `nibPath` spells out `GCF_036323735.1`, its refNames already
**are** that assembly's RefSeq accessions (`NC_086019.1`), and its GenArk twin
at `/hubs/genark/GCF/036/323/735/GCF_036323735.1/config.json` has carried a
`-ncbiGff` track since the day it was built. Nothing was hard about rn8; nobody
was prompted to edit the file.

`src/deriveNcbiAccessions.ts` answers the question instead, from three sources,
strongest first. Measured over the 238 assemblies in the live list on
2026-08-26:

- **`nibPath`** — a GenArk-backed alias names its own RefSeq accession
  (`hub:/gbdb/genark/GCF/036/323/735/GCF_036323735.1`). 16 dbs. Not a claim
  about an equivalent assembly; it _is_ the assembly the hub was built from, and
  all 16 have RefSeq-accession refNames.
- **`description`** — a native hub spelling it in prose. 1 db, `mpxvRivers`.
- **`hgFixed.asmEquivalent`** — UCSC's own equivalence table, which is already
  on disk (make.sh rsyncs all of `goldenPath/hgFixed/database`). 58 dbs,
  including the old golden-path assemblies that predate GenArk.

Union: 75, every one of which has an NCBI annotation (checked against
`datasets summary`; 42 are `suppressed`, which is normal for a superseded
assembly and does not stop the download). 1.35GB of GFF for the whole set.

**Only a GCF counts.** 55 entries name a `GCA_` in `sourceName` — hg38's is
`GRCh38 … (GCA_000001405.15)` — and that is the GenBank submission, whose seqids
(`CM000663.2`) are not the ones a RefSeq GFF uses. Reading it would attach an
annotation that resolves to nothing.

### The curated file is now the override layer, and four of its rows are load-bearing

`ncbiRefSeqAccessions.tsv` still wins over anything derived, and `-` as the
accession turns a db off. Deleting it would not be a no-op: **hg38, hg19, mm39
and hs1 have no `ucsc`↔`refseq` row in `asmEquivalent` at all**, and the only
accession their genome-list entry names is the GCA. Nothing detects them; the
four assemblies people actually open would lose their GFF. The other seven rows
(ce11, danRer11, dm6, mm10, rn6, rn7, sacCer3) are recovered by `asmEquivalent`
and kept only because a curated pick should beat a derived one where they ever
disagree — today they agree on every one.

### `import.meta.main` is false for a `.ts` entry point, and it cost every GFF track

`lib/common.sh` exports `NODE_OPTIONS=--experimental-strip-types`, so every
`node src/*.ts` here runs type-stripped. Under that, **`import.meta.main` is
`false`** on node 24.2.0 (it is `true` for a `.mjs` entry point). The CLI block
at the foot of `deriveNcbiAccessions.ts` was guarded on it, so the block never
ran: the script wrote nothing and exited **0**.

`downloadNcbiGff.sh` then read an empty accession list and logged
`0 assemblies detected as NCBI-derived.` — a line that reads like a count, not a
failure — and added no `-ncbiRefSeqGff` track to any of the 238. Measured
2026-08-27: **zero** such tracks existed in the whole corpus, while 11
assemblies still held the GFF a pre-refactor run had downloaded, referenced by
nothing. The exit 0 is why `set -euo pipefail` never saw it.

Two things came out of that, and both generalize:

- Use `process.argv[1] === fileURLToPath(import.meta.url)`, which is what
  `mergeAll.ts` and `removeEverythingButLatest.ts` already do and which is
  verified to work under stripping. `deriveNcbiAccessions.ts` was the only file
  in the tree using `import.meta.main`.
- **A derivation over hundreds of inputs that yields zero refuses now.** The
  emptiness gate in `downloadNcbiGff.sh` exits 1 rather than proceeding, on the
  same principle as `prune_stray_configs` and `check-orphan-configs`: an answer
  of "none" from an input of 238 is a broken run, not an empty answer.

### Two gates, because a GFF whose seqids resolve to nothing is worse than no GFF

A track that loads and draws nothing reads as "this assembly has no NCBI
annotation". Both gates are local reads; neither costs a request.

- **Addressability, before the download** (`hasRefSeqAliases`). The GFF's
  `NC_`/`NW_` seqids reach refNames only through the assembly's chromAlias, and
  `database/chromAlias.txt.gz` says outright whether UCSC knows the RefSeq names
  — it is `(alias, chrom, source)` triples and the source column reads `refseq`,
  `ensembl`, `genbank,ensembl`. cavPor3 has a refseq row; **oryCun2, musFur1 and
  loxAfr3 do not**, and are dropped despite being in `asmEquivalent`. `aptMan1`
  is dropped too, for a different reason worth knowing: its refNames _are_
  RefSeq accessions, under UCSC's dot-to-`v` mangling (`NW_013995860v1`), and it
  publishes no alias table to undo that with. Hub assemblies skip this gate —
  they have no rsync'd `database/` dir and do not need one.
- **Overlap, after the download** (`seqids_resolve` in `downloadNcbiGff.sh`).
  `tabix -l` against the assembly's refNames and aliases, which answers the
  question a _partial_ `asmEquivalent` match leaves open — galGal6 matches 455
  of 464 sequences, rn6 and oryCun2 less. Zero overlap skips the add-track; the
  GFF stays cached, so the next run re-checks it for free.

Not being able to answer is deliberately not the same as answering no. A hub
assembly on a cold tree has nothing mirrored beside its config yet, and refusing
there would withhold the track from every GenArk-backed alias on its first build
— the exact case the detection exists to serve. It says so and proceeds.

`<db>-ncbiRefSeqGff` matches `ncbirefseq` in `MINIMAL_TRACK_PATTERNS`, so a
newly detected assembly's GFF lands in its `minimal.json` as well. That is the
existing behaviour for the 11, not a new decision.

## multiWig composites, table-backed big files, and ENCODE

A UCSC `container multiWig` composite converts to a single
`MultiQuantitativeTrack` whose `MultiWiggleAdapter` has one subadapter per
subtrack, rather than to N tracks (`ucsc2jbrowse/src/mergeMultiWigTracks.ts`).

A `type big*` track with no `bigDataUrl` keeps its file path in the golden-path
table named by its `table` setting, which `src/resolveTableBigFile.ts` reads
from the rsynced `database/` dir (`buildConfigs.ts` hands `addBigDataTracks` the
`dbDir` for this). Without it the legacy ENCODE regulation composites never
convert, which on hg19 means no regulation signal tracks at all, since ENCODE 4
is hg38-only. The aggregate carries `metadata.multiWigContainer`, which exempts
it from the too-many-tracks drop rules in `getTrackModifications.ts` — it is one
track, and for the ENCODE ones its trackId would otherwise match the `wgEncode*`
rule.

ENCODE's individual-experiment composites (12,729 subtracks on hg38) stay
dropped. `agent-docs/ENCODE_TRACKS.md` records why, what was measured, and what
would have to come first (UCSC's own faceted metadata TSVs) if they are ever
loaded as connections.

## The UCSC genome list timestamps itself, and that rebuilt the website every run

`api.genome.ucsc.edu/list/ucscGenomes` stamps every response with the time of
**your request**:

```
"downloadTime": "2026:09:10T00:00:14Z", "downloadTimeStamp": 1788998414,
"dataTime": "2026-08-18T15:38:37",      "dataTimeStamp": 1787092717,
```

`dataTime` is the real data clock and is stable; `downloadTime` is not, so
make.sh's `curl > list.json.raw` writes different bytes on every run whether or
not UCSC moved anything — verified by fetching twice, two seconds apart, and
diffing at byte 39.

That file was being rsynced to the bucket, and the rclone changed-object count
is what gates **both** the `/ucsc/*` CloudFront invalidation and run.sh's
decision to rebuild the website. So every run invalidated, rebuilt astro,
shipped the 5.4GB tree and invalidated `/*` — and the branch that reads "No
genark/ucsc/website changes detected; skipping website build, deploy, and
CloudFront invalidation" **could never once fire**. Confirmed across the last 12
run logs: `list.json.raw: Copied` in every completed one, `ucsc=1` in every RUN
SUMMARY. On 2026-09-09 that was a 5.4GB deploy whose only input change was a
timestamp.

`list.json.raw` is now excluded from the sync, for the same reason
`.pipeline_hash` and `tracks.json` are: it is build state, nothing reads it from
the bucket, and `src/transformGenomeList.ts` turns it into the `list.json` that
is published, which drops the timestamps. The stale copy already in the bucket
stays — rclone leaves excluded objects alone on both sides.

The general shape is worth keeping: **anything synced whose bytes are a function
of the clock turns a change-gated deploy into an unconditional one**, and it
does so silently, because "changed" is exactly what the pipeline is built to act
on.

## A derivation phase that prints nothing is indistinguishable from a hung one

`createBedTracksForGoldenPath.sh`'s `process_assembly` emitted no output at all,
and `PARALLEL_OPTS` correctly drops `--bar` when stdout is not a terminal, so a
re-derivation run was a wall of silence. Recovered from the 2026-09-07 log: BED
tracks **37m56s**, RepeatMasker **8m14s**, gene tracks **9m40s**.

Recovered, because those three markers were not readable. `xxhsum` 0.8.1 writes
a 72-byte carriage-return progress line to stderr per invocation and has no flag
to stop it (`-q` is about benchmark and check mode). `detect_changed_assemblies`
already dropped it deliberately; `needs_rebuild`, `save_rebuild_stamp`,
`source_tree_hash` and the trackDb stamp did not — and those run per derived
file. The result was a **single 297,917-character line** of 8,275 CR segments,
and since a CR segment ends without a newline, the `log` lines that followed
were appended onto it: `[09:33:41] Creating RepeatMasker tracks...` was inside
that line, invisible to `grep '^\[2026'` and to anyone scrolling. Three of the
last eight run logs have a ~298KB line like it. All four call sites now drop
that stderr; a failed hash still reads as "changed" and rebuilds, which is the
safe direction, and `save_rebuild_stamp`'s pipefail still fails the job.

`run_for_assemblies` and `run_for_assemblies_lenient` now share one body with a
`--joblog`, and print one line per phase naming the assemblies that dominated
it. Verified against real `parallel` in all four combinations of strict/lenient
× success/failure; `ucsc2jbrowse/common.test.sh` pins that the lenient runner
survives, names the failing assembly and reports timing, and that the strict one
still aborts under `set -e`.

## The website deploy is a symlink swap, and the old one was a scheduled outage

`website/deploy.sh` (`pnpm run deploy`, `pnpm run deploy:staging`) unpacks the
build into `/var/www/releases/<target>/<utc-timestamp>/`, verifies it, and then
`mv -T`s the `/var/www/html` symlink onto it — one `rename(2)`, so a request is
served entirely by the old release or entirely by the new one.

What it replaced was a single npm-script line:

```
tar -czf - -C dist . | ssh myserver 'rm -rf /var/www/html/* && tar -xzf - -C /var/www/html'
```

That is not a bad failure mode, it is a **guaranteed** one. The tree is 5.4GB in
128,963 files, and unpacking it takes ~4 minutes — during which the webroot has
already been emptied, so genomes.jbrowse.org 404s for the whole window and
CloudFront caches those 404s past the end of it. That is what "the EC2 server is
showing 404" was on 2026-08-26 at 20:22–20:26 UTC; nothing had failed, a deploy
was simply in flight. A stream that _does_ die leaves the site broken with no
copy of it left anywhere.

Three properties are load-bearing:

- **Nothing is deleted until the new release serves traffic.** Old releases are
  pruned at the _start_ of the next deploy, not the end of this one, so peak
  disk is two releases (11GB of the 34GB free) rather than three.
  `KEEP_RELEASES=2` is therefore "current plus one rollback", and the prune
  keeps `keep - 1` because the incoming release does not exist yet — an
  off-by-one here silently costs 5.4GB per target.
- **Both guards must run before the swap.** A local failure is invisible to a
  pipeline (its exit status is the last command, so a truncated archive with a
  healthy `ssh` exits 0 — that is how the old line could have invalidated
  CloudFront over a half-uploaded site). So the remote side runs under
  `set -euo pipefail`, and the file count is compared against the local one
  before the symlink moves. Both were tested by injecting a truncated stream and
  a short archive: both abort with the previous release still serving.
- **`/var/www` is owned by `ubuntu`** and the webroots are symlinks. Without the
  first the swap cannot happen unprivileged; without the second `mv -T` refuses.
  The script migrates a real-directory webroot on its own, so a rebuilt server
  needs only the `chown`.

**tar+zstd, not rsync**, and the reason is `prebuild`: it runs `pnpm clean`, so
every one of the 129k files has a fresh mtime on every build. rsync's quick
check is size+mtime, so it would consider the entire tree changed and round-trip
per file — which is what "rsync was slow" was. Making rsync worthwhile means
`--checksum` (reading 5.4GB on both ends) plus `--link-dest` against the
previous release to hardlink what did not change; that is a real option if
deploys need to get faster, but it is a different trade, not a drop-in.

## The pangenome graph config is ours, and it lives in the bucket

`website/pangenome-config/hprc-grch38.json` is the config every graph launch on
`/pangenomes/*` opens (`graphBrowser.configUrl` in
`website/src/components/pangenomeDataset.ts`). It is published to
`s3://jbrowse.org/pangenome/hprc-grch38/config.json` by `upload.sh` beside it,
with an `upload_if_changed` stamp, because jbrowse-web fetches `?config=` from
the visitor's browser and genomes.jbrowse.org sends no CORS headers — only the
bucket does. **Run `website/pangenome-config/upload.sh` before deploying a
change that touches it**; a launch naming a config the bucket lacks fails to
fetch. The data it names stays under `jbrowse.org/demos/hprc/`, built in the
jbrowse-components repo (its README there says how).

The plugin url is the unversioned `demos/graphgenomeviewer/…esm.js` entry point,
not a content-hashed sibling: the plugin links an unreleased
`@jbrowse/render-core`, so an old bundle stops booting as `main` moves. It
error-pages every released host (`createSvgIcon` — re-measured 2026-08-26 on
`latest` = v4.3.0), which is why `features.pangenome` stays staging until v5.

`pnpm check-pangenome-launches` boots every launch on `main`, including one
whole-chromosome tier launch; run it after touching `pangenome*` or the config.
The genomes.jbrowse.org side of the JBrowse docs
(`website/docs/tutorials/genomes_pangenome.md` in jbrowse-components) is a
tutorial for these pages, so a visible change here should be reflected there.

### One graph, one route, and almost no prose

`/pangenomes/<id>` — `hprc`, `mouse`, `bovine` — is a page per graph, rendered
by `website/src/pages/pangenomes/[dataset].astro` from the dataset.
`/pangenomes` is a list of the three and nothing else. A graph's page is one
sentence, a line of links, the chromosomes as graph links, a table of its loci
with their launches (`lociRows` in
`website/src/components/pangenomeLociRows.ts`), the **Any region** box where the
dataset publishes a structural-state sidecar, and the file table. Apart from
that box the page is static HTML with one six-line style rule: the site's table
rules and the browser's defaults are the whole design, on purpose, after the
2026-09-16 review found the previous page a wall of prose and buttons.

The 2026-09-16 review also removed a free-text region box that did nothing but
build launches, since the table and the chromosome links cover those. The **Any
region** box that came back the next day is a different thing: it answers a
question first, which structural forms the callset's haplotypes carry in the
window asked for (see "A locus's haplotypes are lanes" below), and its launches
follow from that answer. It keeps the question in the url as `?region=`, reads
windows of up to `MAX_DETAIL_WINDOW_BP` (150 kb), and offers only the graph for
a wider one.

`/pangenomes/explorer` was a separate app until that day — a card grid of loci
with class filters and a per-locus dashboard of four bar charts computed by
`generatePangenomeData.ts` over the callset, plus a "hero" banner of seven
buttons on each graph's page pointing at it. All of that is gone, along with
`portal.css`, the per-locus `*.vcfsummary.json` summaries, the `notes[]`
caveats, the per-locus `significance` sentences and the PangyPlot fallback
(`externalGraphBrowser`), which only the old region box ever reached; the locus
table is what replaced it. The route is a redirect stub in `REDIRECT_STUBS`
(astro.config.mjs) because the JBrowse pangenome tutorial links it, and its
inline script carries `?dataset=<id>` across to `/pangenomes/<id>`.

### One rule decides how wide a window is drawn, and it removed four surfaces

`lanes()` in `website/src/components/pangenomeLinks.ts` picks the segment-level
lanes under `MAX_DETAIL_WINDOW_BP` (150 kb) and the coarse bubble tier above it,
and `graphRegionUrl` follows with the tier as `loadedTrackId`, `maxRegionBp`
raised to the span and the anchored layout. Everything below fell out of that on
2026-09-10, so a change here is a change to all of it:

- **`graphChromosomeUrl` is gone.** A chromosome is the widest region and takes
  the coarse branch, so the whole-chromosome launch and the region launch are
  one builder — and the page's chromosome row is a row of links rather than a
  second control.
- **A wide catalog locus has a launch at all.** `graphLocusUrl` used to return
  undefined without a detail window, and `locusLaunchUrl` opened the allele
  inventory (an AlignmentsTrack, 379 rows over mouse's top entry) across
  multi-megabase spans. Half of each derived catalogue is such a cluster — 10 of
  mouse's 20, 12 of cattle's.
- **No region has an upper bound.** `MAX_GRAPH_REGION_BP` existed because the
  view refuses a cut past its `maxRegionBp`; the coarse branch raises it.
- **There is no landing locus.** `landingRegion` and then `preferredLocus`
  answered "which locus does this catalogue open on" for a headline launch and
  the launch-only region box, neither of which exists any more; a reader picks a
  row.

The one asymmetry that stays: the callset does **not** get a coarse tier, so
`graphVcfLgvUrl` still opens on `launchRegion` and a wide locus's variant lane
is still gated. That is a property of a VCF, not of the wiring.

### What a pangenome page is not

It was 15,286 px rendered, and ~10,000 of that was a static 232-row HPRC sample
table plus two mouse-strain tables. `/hubs/HPRC` is a searchable version of the
first and the page's own prose already linked it; the accession pages cover the
other two. All three are links now, `website/src/hprcSamples.json` and its two
siblings are deleted, and HPRC renders through `[dataset].astro` like the other
two rather than being hand-written beside it — which is what finally gave it the
projections table and the caveats list the other two always had.

Two whole features came out with them, and neither is worth rebuilding as-is:

- **The per-locus MSA panel** (`generatePangenomeMsa.ts`, `PangenomeMsaSection`,
  `MsaPanel`) reconstructed 465 haplotypes over one 800 bp window per locus. It
  was 8.1 MB of the 8.4 MB committed under `public/pangenome/`, HPRC-only, and
  its first paint on the headline locus is 465 rows of dashes, because the
  window-picker ranks by indel-weighted variation and lands inside a `GAA`
  expansion one haplotype carries. Note that this did **not** remove the
  react-msaview dependency or the `@jbrowse/core` patch — `/protein-browser`
  uses `MSAViewer` directly.
- **The pangene copy-number matrix** (`generatePangenomePangene.ts`,
  `PangeneMatrix`) drew 100 haplotypes from lh3's `human100` graph under charts
  computed over HPRC's 232 samples. Two cohorts, one locus, and the caption was
  the only thing saying so.

`markerGenes` on a `PangenomeLocus` is the surviving half of the second: it is
read by `syntenyGene` for the gene-hub link and no longer has anything to do
with pangene, which is why it is no longer called `pangeneGenes`.

### A locus's haplotypes are lanes, and the callset picks which

`haplotypes` on an HPRC locus row (`haplotypeLanesUrl`) opens the
`hprc_v2_1_gbz_lanes` track, one lane per haplotype walk read from HPRC's
`.gbz.db` in the browser, narrowed to that locus's panel in
`website/public/pangenome-hprc/panels.json`: one haplotype per structural
**form** in the launch window, commonest first, every form where there are at
most 10 and the commonest 8 otherwise. The panel rides the spec as
`laneFilter.only` and `domain`, so one track in the config serves every locus.

**The forms come from a genome-wide sidecar, not from a per-locus read of the
callset**, which is what makes the same question answerable for a window nobody
curated. `website/pangenome-config/buildHprcSvStates.sh` publishes one
tabix-indexed file of every structural record in the callset — where it is, what
each state does to the reference's structure, one character per haplotype, 18 MB
for the genome — and `structuralForms` (`pangenomeSvStates.ts`) groups a
window's haplotypes out of a ranged read of it, a few KB and about 300 ms.
`generatePangenomePanels.ts` runs that over the curated loci and commits the
result; the **Any region** box on the page (`PangenomeRegionForms.tsx`) runs the
same two functions in the reader's browser for a locstring or a gene symbol,
over a window of up to 150 kb. A table row and the same window typed in the box
cannot disagree, because neither has rules of its own.

Two things the sidecar fixed rather than moved, both measured 2026-09-17. The
old rule read the 2.3 GB callset with bcftools at five seconds a locus. And it
filtered on `LV=0`, which is not "top level" in this file: vcfbub pops a parent
snarl with an allele over 100 kb and keeps its children, and all 425 parents
that nested records name genome-wide are absent, so the filter dropped real
variation — HP's panel was 457 against 5 over a rare 302 bp deletion and is now
260 / 184 over the 1.7 kb deletion 40% of haplotypes carry. 19 of the 20 loci
have a panel where 15 did; srgap2, whose window holds no structural record at
all, is the one that does not. Why a panel and not the tutorial's eight, why 10
and 8, and what a "form" is: `agent-docs/PANGENOME_PORTAL.md`.

A lane draws its haplotype's gene models when the config has a track declared
for that haplotype's assembly alone, which is the rule `MultiWaySyntenyDisplay`
applies; there is no spec key for it. So every HPRC release 2 haplotype is an
assembly in `hprc-grch38.json`, and the 462 that CAT annotates each carry a gene
track (HG002's two have none). Two scripts keep it that way:

- **`website/generatePangenomeHaplotypes.ts`** writes the haplotype half of the
  config and each assembly's `chrom.sizes`, read off the release 2 assembly's
  own `.fai`. Measured with all 465 assemblies on 2026-09-17: ~0.1 s more at
  boot and 19 KB gzipped, and nothing per launch beyond the lanes it opens,
  because jbrowse-web loads an assembly only when something reads it.
- **`website/pangenome-config/buildHprcGenes.sh`**, on the build box, reduces
  each CAT annotation to one transcript per gene as BED12
  (`generatePangenomeGeneModels.ts`) and publishes it under
  `jbrowse.org/pangenome/hprc-grch38/genes/`. That is ~3.4 MB a haplotype
  against 129 MB for CAT's own GFF3 bgzipped, because a lane draws one model per
  gene and CAT repeats a ~30-field attribute block on every exon row. HPRC's
  files are plain gzip in gene order, so they are rehosted rather than read in
  place. It keeps what it has built.

Then `upload.sh` publishes the config. `pangenomePanels.test.ts` fails if a
haplotype the lane track maps has no gene track, other than HG002's.

Two things keep it drawing, and both fail silently:

- **A haplotype the track maps to an assembly must be that assembly's alias.**
  The launch filters by PanSN prefix (`HG00099#1`) and the adapter names a
  mapped lane after the assembly (`HG00099.1`); only an alias makes the display
  see one lane. Without it the CFHR panel drew 6 of 8. `pangenomeLinks.test.ts`
  pins it against the config.
- **`pnpm check-pangenome-launches` reads the lanes back**, lane by lane, rather
  than the display type, which passed on 2026-09-17 while every lane on every
  host errored. That fault was in the graph plugin, which read
  `@jbrowse/synteny-core` from a host global the RPC worker serves as UI stubs.
  Its `--local` pauses only the urls it substitutes: puppeteer's request
  interception stalls every request the worker makes, so under it no track data
  loads and a lane check can only fail. It also fails a lane whose haplotype has
  a gene track and reads "no annotation" or never fetches its genes, which is
  how an unpublished `hprc-grch38.json` shows up without `--local`.

## The protein browser launches a session the plugins have to agree with

`/protein-browser` (`website/src/components/ProteinBrowser.tsx` and the files
beside it) is the landing page for the "Proteins in the Genome Browser" paper:
gene symbol → collapsed-intron genome view + 3D structure + ortholog alignment,
three views on one transcript model. The design record, including the two
residue↔codon mapping bugs that shipped with every unit test green, is
`agent-docs/PROTEIN_BROWSER.md`. Three things to hold onto:

- **`userProvidedTranscriptSequence` is the transcript's own translation**, the
  NP record of the picked isoform — never the UniProt canonical. The protein3d
  plugin pairwise-aligns it against the structure's residues; handing it the
  structure's own sequence makes that alignment an identity and mis-indexes the
  CDS whenever the isoforms differ. Silently.
- **Structures are asked for, not derived.** `structureSources.ts` reads the
  AlphaFold prediction API (which models exist, at which version, with which
  sequence); p2s_mapper's `fetchExperimentalStructures` reads 3D-Beacons
  filtered to `provider === 'PDBe'`. A url built from `AF-<acc>-F1-model_v6.cif`
  404s for any protein past AlphaFold's length cap (DMD, BRCA2, TTN) and for
  every version bump.
- **`pnpm check-protein-launches` is the test that matters.** It boots each
  example gene in a hosted build and reads the ProteinView back: structure
  ready, `pairwiseAlignment` present, `exactMatch` where the model's sequence
  equals the translation — and, for a chip with a preset focus, the focused
  launch too, reading the MsaView's row count and transcript mapping back. Needs
  a browser and six live services, so it is by-hand, before touching
  `geneStructure.ts`/`proteinSession.ts`/`pfamSeed.ts` and before promoting
  `features.proteinBrowser`.
- **A Pfam seed row is a domain, not a protein, and the session is linked
  through the domain's codons alone.** `pfamSeed.ts` puts the translation's own
  segment into the family's seed (InterPro serves it, 4–15 KB) and
  `proteinSession.ts` cuts the MsaView's `connectedFeature` to that segment with
  `sliceCds`, so the row's first residue is the feature's first codon. Carrying
  the whole translation as the row instead costs a column of gaps per flank
  residue in every other row: NOTCH1's EGF seed went from 4.9 KB to 174 KB and
  lost 51 of 67 rows to the plugin's 50 KB snapshot cap.
- **The map's coordinates are the UniProt canonical's.** InterPro regions and
  PDBe interface residues are on it; the launched transcript's translation may
  be another isoform, and `ProteinLaunchCard` says "approximate" whenever the
  model is not the canonical entry folded from exactly that translation. A
  focused partner opens the PDB complex by `initialResidues` in the entry's
  author numbering, shifted through SIFTS (p2s_mapper's `toAuthorRange`) —
  haemoglobin chains count from the mature protein, one behind UniProt — never
  by `initialSelection`.

## Key website internals

- `src/components/SearchPage.tsx` — client-side search over
  `public/searchIndex.json`, ranked by `rankEntries` (`searchScoring.ts`), which
  the header typeahead (`headerSearch.ts`) shares. `rankEntries` lowercases each
  entry's fields once per index, not once per keystroke. Every search box and
  table filter on the site splits a query with `src/lib/searchTerms.ts` and
  requires every term.
- `src/lib/searchIndex.ts` — the `IndexEntry` tuple, declared once for the
  generator that writes the index, the generators that read it back and the
  client:
  `[accession, commonName, scientificName, assemblyName, assemblyStatus, source, taxonId, ncbiStatus, year, ucscRank, altAccession]`,
  where `ncbiStatus` is a bitfield of `IS_REFERENCE` (1) and `IS_SUPPRESSED`
  (2). `src/hooks/useSearchIndex.ts` fetches it through the same `loadJsonOnce`
  cache as the typeahead, so the two share one download.
- `src/pages/recently-updated/` — one server-rendered page per GenArk category
  (`[category].astro`) plus the all-categories `index.astro`, linked as tabs.
  The index page forwards the old `?category=` links to the category's page.
- `src/recentlyUpdated.json` — build-time generated data for recently-updated
  page, from `genark2jbrowse/hubFirstSeen.json` (below)
- `astroBuild.sh` — `astro build` with its per-route log collapsed into a
  counter. Astro logs one line per generated route at info level
  (`core/build/generate.js`, `logRenderTime`) and offers no knob short of
  `--silent`, which would also drop the vite warnings and the build summary.
  This site has one route per GenArk accession, so on 2026-09-09 those lines
  were **129,261 of run.sh's 130,796** — 98.8% of a full pipeline log, burying
  every line the pipeline itself wrote and making each `logs/run_*.log` ~50MB.
  Only the route lines match the filter; errors pass through, and a build that
  dies mid-generation still reports how far it got.
- `taxonomyBuilder/` — one `build_taxonomy.py` process for all 19 categories,
  not one each. It parses `nodes.dmp` + `names.dmp` (477MB, 2.6s) before it can
  build anything, and those cannot change between two categories of the same
  run, so the per-category loop spent ~50s re-reading the same two files:
  **52.9s → 4.7s**, with all 19 `.newick` files byte-identical. It still takes
  each category as its own `--input`/`--output` pair and still carries on past
  one it cannot build, so a bad input costs one tree rather than all 19. The
  `&& pnpm format` that used to follow it was vestigial — it ran _before_
  `pnpm generate`, and everything `generate` writes is either under `public/`
  (oxfmt-ignored) or gitignored.

## UCSC hubs vs GenArk aliases (two-flavor configs)

The UCSC genome list is fetched **live** from
`api.genome.ucsc.edu/list/ucscGenomes` on every `ucsc2jbrowse/make.sh` run, so
new UCSC assemblies can appear (and break the pipeline) without any repo change.

Hub-backed entries (`nibPath` starts with `hub:`) come in two shapes, and
`buildConfigs.ts` (`hubUrl`) derives the `hub.txt` URL from `nibPath`, not the
assembly name:

- native UCSC assembly hub (e.g. `hs1`, `mpxvRivers`): `hub:/gbdb/<db>/hubs` →
  `/gbdb/<db>/hubs/public/hub.txt`
- **GenArk-backed alias** (e.g. `rn8` = GRCr8): `hub:/gbdb/genark/<GC[AF] path>`
  → `/hubs/<GC[AF] path>/hub.txt` (served from `/hubs/`, not `/gbdb/genark/`)

A UCSC assembly and a GenArk assembly can be the **same biological genome** and
both get a full config — this is intentional, not a bug. `buildUcscMapping`
(`mapAccessionsToUcsc` in `website/src/utils/ucscMapping.ts`) maps an NCBI
accession to a UCSC db name, and the accession page prefers the UCSC config
(`/ucsc/<db>/config.json`) when one exists, falling back to the GenArk config
otherwise. The mapping takes an accession (or its paired one) that the entry's
`sourceName` or description names; failing that, an entry of the same taxon
whose description spells the same assembly name, with a `.pN` patch suffix
dropped (`GRCh38.p14` → hg38, `GRCg6a` → galGal6). A shared accession base is
never enough: GRC keeps one base across major versions, and the old base
fallback sent GRCm38's `GCF_000001635.26` to mm39. When unsure it maps nothing,
which costs a launch of the GenArk config rather than a launch of the wrong
genome. So do **not** "dedup" GenArk aliases by pointing them at the GenArk
config — that would make them inconsistent with hg38/mm39/etc., and the
accession page relies on the `/ucsc/<db>/config.json` build existing.
