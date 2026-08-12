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

## TODO: drop the react-msaview patch once @jbrowse/core catches up

`patches/react-msaview@5.6.3.patch` (wired up via `patchedDependencies` in
`pnpm-workspace.yaml`) exists for one reason: react-msaview 5.6.x is built
against **unreleased** `@jbrowse/core`. Its `dist/fetchUtils.js` imports
`statusMessageText`, added to jbrowse-components on 2026-06-17 (`7e576348e8`,
"More robust concept of progress") — after `@jbrowse/core@4.3.0` was published
on 2026-05-21, and 4.3.0 is still `latest` on npm. Without the patch,
`astro build` dies with `[MISSING_EXPORT] "statusMessageText" is not exported`,
which fails `pnpm build` and therefore `run.sh`'s `predeploy`.

The patch inlines the function rather than importing it. That is exact, not
approximate: on 4.3.0 `BaseOptions.statusCallback` is still
`(message: string) => void`, so a status is always a plain string and the shim
returns it unchanged. `statusMessageText` is the **only** missing symbol — every
other `@jbrowse/core/*` module and named import in 5.6.3's dist resolves against
4.3.0.

**Delete the patch** (`patches/`, the `patchedDependencies` block, then
`pnpm install`) as soon as a `@jbrowse/core` exporting `statusMessageText`
ships, or react-msaview publishes a build that stops importing it. Nothing
silently rots in the meantime: `patchedDependencies` pins the exact version
`react-msaview@5.6.3`, so the next msaview bump fails the install loudly.

Why not just pin react-msaview to 5.5.0, the last version that builds? Because
5.5.0 → 5.6.3 is 62 changed source files (column stats, overlay colors, header
refactor, mouseover rework), and msaview's peer range is
`@jbrowse/core ">=2.0.0"` either way — so the downgrade buys nothing but lost
work, and pnpm would not warn when the same trap reappears.

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
  67s and the two text-index passes (`textIndexGoldenPath.sh`, then
  `downloadNcbiGff.sh` overwriting it) were 10s and 23s. Under-invalidating
  ships wrong configs indefinitely. Add new inputs to the list rather than
  reasoning about whether they matter.
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

### genark2jbrowse escalates the mode instead of stamping each hub

Same gap, different shape: genark's "new" means "this accession has no hub.txt
yet", so an existing hub's config is never regenerated and a converter change
reaches none of the 50,701 until someone remembers `--reprocess-all`.

It gets **one repo-level stamp** (`genark2jbrowse/.pipeline_hash`), not the
per-assembly stamps ucsc2jbrowse uses — there the unit of work is ~240
directories, here it is 50,701, and a stamp beside each would be 50,701 files
answering a question with one answer. When it differs, `MODE` escalates from
`new` to `all`, which is already exactly "every hub is stale".

`save_pipeline_stamp` refuses to write on an incremental run: `new` mode touched
only new hubs, so recording the current hash would claim the other 50,700 are
current and swallow the next change. The lone exception is the same bootstrap as
above — an absent stamp has to start somewhere.

Both stamps are gitignored. They describe the built tree **on this machine**; a
checkout whose stamp disagreed with its own `hubs/` would either skip a rebuild
it needs or force one it does not.

## The tail of `ucsc2jbrowse/make.sh` is one walk, not six

`src/finalizeConfigs.ts` reads each built `config.json` once, applies the six
steps in its `STEPS` array in order, and writes it back once. They used to be
six separate `node src/…` lines in `make.sh`, each doing its own full-tree walk.
Fusing them saved almost nothing (~0.6s on hg38, the worst config) — the reason
to do it was that the order had become an accident of line numbering, and two of
those adjacencies are load-bearing:

- `generateDefaultSessions` before `createMinimalConfig` (see below)
- `ensureAssemblyAliasesAndCytobands` before `mirrorAssemblySidecars`, which
  mirrors the urls the first one adds

Both reasons are written beside the array. **Add a step by putting it in
`STEPS`, and say whether its position matters.** A step takes a
`FinalizeContext` (`src/utils/finalizeStep.ts`), mutates `ctx.config` in place,
and returns counters for the run summary; it never reads or writes `config.json`
itself. The one exception is `createMinimalConfig`, which derives a second file
— `minimal.json` — rather than mutating anything, which is exactly why it goes
last.

Verified byte-identical to the six-pass version over all 238 built assemblies
(476 files, `config.json` and `minimal.json`) on 2026-08-05. Re-verify the same
way after touching this: snapshot `$UCSC_BUILT_DIR/*/config.json` and
`minimal.json`, re-run, `diff -rq`. It is idempotent on a warm tree, so a
nonempty diff is a real finding.

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
  explicit: `generateDefaultSessions` precedes `createMinimalConfig` in the
  `STEPS` array in `src/finalizeConfigs.ts`, which documents why.

Three configs are still legitimately empty — `cb1`, `hgFixed`, `enhLutNer1` have
no annotation to include (the first two are not assemblies at all; `common.sh`'s
`is_assembly_db` already knows this).

`renames` used to be counted as a fourth, and was not an assembly at all: it was
a stray copy of `ucscRenames/hg38.json` (the trackId → new-name map, `"DELETE"`
sentinel and all) that had been swept up and processed as a config, leaving
`assemblies: [{}]` and four `unpkg.com` plugin urls frozen since 2025-08-11.
Deleted 2026-08-05. Two things let it persist, both now addressed — but the
first is structural and still worth knowing:

- **`configs/` is an append-only mirror.** `make.sh` copies
  `$UCSC_BUILT_DIR/<db>/config.json` to `configs/<db>.json` and never prunes, so
  a db that disappears upstream leaves a config behind forever, still feeding
  `mergeAll`, `checkPluginUrls` and `checkConfigCompat`. Compare `configs/`
  against `api.genome.ucsc.edu/list/ucscGenomes` when something looks stale;
  `hgFixed` is the one legitimate extra (make.sh rsyncs it deliberately).
- **`mergeAll` deduped plugins on whole-object identity**, so the same plugin
  under two urls was two entries. `all.json` was asking PluginLoader to install
  each of the four plugins three times over. It now dedupes by name, preferring
  the canonical `latest/` path — see `mergePlugins` in `src/mergeAll.ts`.

## Staging a config-level feature

`features.staging` (`website/src/config/features.ts`) only gates website pages
and which hosted JBrowse build links target — the configs themselves are one
tree served to both sites, so regenerating `config.json` publishes to production
too.

To stage something that lives in the config (a plugin, a track), have
`ucsc2jbrowse/stageConfigs.sh` write it into a **sibling** `config-staging.json`
(and `all-staging.json`), and read the filename through `ucscConfigPath` /
`ucscAllConfigPath` in `website/src/config/jbrowse.ts`. It has to be a sibling,
not a `/ucsc-staging/` tree: a UCSC config names ~600 of its files relatively
(`centromeres.bed.gz`, `ncbiRefSeq.gff.gz`, `trix/*`) and jbrowse-web resolves
those against the config's own URL, so only a file in the same directory reaches
the data production serves. `enhanceConfig` is idempotent, so the staging pass
is just a copy plus a re-run with the extra env set, cheap enough to run alone.

Two things are staged this way today, both env-gated in `enhanceConfig` and both
set by `stageConfigs.sh`: `BLAT_PLUGIN_URL` (the BLAT plugin) and
`RMSK_MULTIROW_DISPLAY` (the RepeatMasker track's split-by-class multi-row
display, `hubtools/src/repeatClassDisplay.ts`). The second is waiting on a
release rather than on a decision — delete its gate and call
`addRepeatClassDisplay` unconditionally once a released `latest` carries
`LinearMultiRowFeatureDisplay`, which is also what the website's
`HOST_HAS_MULTISAMPLE_VARIANT_DISPLAY` is waiting on. Re-run the probe rather
than assuming, since from this side the failure is silent.

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
`LinearMultiSampleVariantDisplay` (`website/src/config/jbrowse.ts`,
`HOST_HAS_MULTISAMPLE_VARIANT_DISPLAY`, measured 2026-08-06).

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
fetched is left pointing upstream and retried next run. It is one of the six
steps in `src/finalizeConfigs.ts` (below), and must run **after**
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
is one step in `finalizeConfigs.ts`; if it throws or leaves `STEPS`, this is
what notices. Other assemblies are reported rather than failed, because a
sidecar whose fetch failed is deliberately left upstream and retried next run —
making that fatal everywhere would turn one blip into a blocked deploy.

As of 2026-08-05 all 235 real UCSC assemblies are fully mirrored; the only
upstream `chromSizes` are `cb1` and `hgFixed`, which are not assemblies and
whose files 404 anyway. For hg19/hg38 specifically, all three sidecars are
served from our bucket and verified live, so `loadPre()` touches only
jbrowse.org — a UCSC outage costs the sequence track (the 2bit is still theirs,
too big to mirror) and the individual tracks that name hgdownload, but the
assembly still opens.

Two things that will bite a change here:

- `chromSizes` is a **bare string** on TwoBitAdapter, not a `{ uri }` node, so
  anything that rewrites relative locations has to name it explicitly —
  `mergeAll.ts` does, or `all.json` would resolve it against `/ucsc/`.
- Relative is safe back to the v4.0.0 support floor only because jbrowse-web
  stamps `baseUri` beside the adapter's `uri` and TwoBitAdapter's
  `preProcessSnapshot` forwards it to `chromSizesLocation`. Full reasoning:
  `agent-docs/architectural-decision-records/0003-mirror-assembly-sidecars.md`.

## multiWig composites, table-backed big files, and ENCODE

A UCSC `container multiWig` composite converts to a single
`MultiQuantitativeTrack` whose `MultiWiggleAdapter` has one subadapter per
subtrack, rather than to N tracks (`ucsc2jbrowse/src/mergeMultiWigTracks.ts`).

A `type big*` track with no `bigDataUrl` keeps its file path in the golden-path
table named by its `table` setting, which `src/resolveTableBigFile.ts` reads
from the rsynced `database/` dir (`createTracksJsonForGoldenPath.sh` passes
`db_dir` to `mergeBigFileTracks.ts` for this). Without it the legacy ENCODE
regulation composites never convert, which on hg19 means no regulation signal
tracks at all, since ENCODE 4 is hg38-only. The aggregate carries
`metadata.multiWigContainer`, which exempts it from the too-many-tracks drop
rules in `getTrackModifications.ts` — it is one track, and for the ENCODE ones
its trackId would otherwise match the `wgEncode*` rule.

ENCODE's individual-experiment composites (12,729 subtracks on hg38) stay
dropped. `agent-docs/ENCODE_TRACKS.md` records why, what was measured, and what
would have to come first (UCSC's own faceted metadata TSVs) if they are ever
loaded as connections.

## Key website internals

- `src/components/SearchPage.tsx` — client-side search over
  `public/searchIndex.json`
- `src/pages/recently-updated.astro` — server-rendered table with category
  dropdown filter
- `src/hooks/useSearchIndex.ts` — SWR fetch of the search index;
  `IndexEntry = [accession, commonName, scientificName, assemblyName, assemblyStatus, source, taxonId, ncbiStatus]`
  (ncbiStatus: 0=none, 1=reference genome, 2=suppressed, 3=both)
- `src/recentlyUpdated.json` — build-time generated data for recently-updated
  page

## UCSC hubs vs GenArk aliases (two-flavor configs)

The UCSC genome list is fetched **live** from
`api.genome.ucsc.edu/list/ucscGenomes` on every `ucsc2jbrowse/make.sh` run, so
new UCSC assemblies can appear (and break the pipeline) without any repo change.

Hub-backed entries (`nibPath` starts with `hub:`) come in two shapes, and
`generateJBrowseConfigForAssemblyHub.sh` derives the `hub.txt` URL from
`nibPath`, not the assembly name:

- native UCSC assembly hub (e.g. `hs1`, `mpxvRivers`): `hub:/gbdb/<db>/hubs` →
  `/gbdb/<db>/hubs/public/hub.txt`
- **GenArk-backed alias** (e.g. `rn8` = GRCr8): `hub:/gbdb/genark/<GC[AF] path>`
  → `/hubs/<GC[AF] path>/hub.txt` (served from `/hubs/`, not `/gbdb/genark/`)

A UCSC assembly and a GenArk assembly can be the **same biological genome** and
both get a full config — this is intentional, not a bug. `buildUcscMapping`
(`src/utils/accessionData.ts`) maps an NCBI accession to a UCSC db name via the
`GC[AF]_…` in the entry's `sourceName`, and the accession page prefers the UCSC
config (`/ucsc/<db>/config.json`) when one exists, falling back to the GenArk
config otherwise. So do **not** "dedup" GenArk aliases by pointing them at the
GenArk config — that would make them inconsistent with hg38/mm39/etc., and the
accession page relies on the `/ucsc/<db>/config.json` build existing.
