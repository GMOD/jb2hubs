---
name: toolchain
description:
  'Why the lint, format and typecheck setup is shaped as it is, and why the
  website runs a patched @jbrowse/core 4.3.0 under MUI 9.'
---

# Toolchain

Moved out of the root `CLAUDE.md` on 2026-10-08, which keeps the rules. Dated
measurements and incidents read as written at the time.

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
