---
name: toolchain
description:
  'Why the lint, format and typecheck setup is shaped as it is, and what
  embedding a JBrowse component in the website cost while it did.'
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

## Embedding a JBrowse component costs a version split

Until 2026-10-09 the protein browser drew its alignment on the page with
react-msaview 8.x, on MUI 9, mobx 7 and MST 6, while the newest published
`@jbrowse/core` (4.3.0) was on MUI 7, mobx 6 and MST 5. Installed together, both
copies of each land in the page and the viewer does not render at all: MobX
reports multiple versions and MST refuses the viewer's model, and a MUI 7 theme
handed to MUI 9's `ThemeProvider` throws inside react-msaview's error boundary.
Keeping it alive took pnpm `overrides` hoisting core onto the newer four, plus a
patch renaming two `HelpOutline` icon imports MUI 9 dropped, measured in a
browser in all three states on 2026-08-26.

The page now launches the alignment instead of drawing it, so the overrides, the
patch and every MUI, emotion and mobx dependency are gone (the commit that
removed them has the whole record). Core stays as a devDependency for the tests
that evaluate jexl callbacks, on its own MUI 7, which nothing renders. Before
embedding any JBrowse component again, expect the split back until core v5
publishes, and check with a browser: every failure here happens inside an error
boundary, so a green build proves nothing. with no console errors from the page.
