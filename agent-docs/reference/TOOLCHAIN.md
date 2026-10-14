---
name: toolchain
description:
  'Why the lint, format and typecheck setup is shaped as it is, and what
  embedding a JBrowse component in the website cost while it did.'
---

# Toolchain

## Lint, format, typecheck (oxc toolchain)

`pnpm lint:fast` (oxlint, syntactic) → `pnpm lint` (`oxlint --type-aware`, the
full typed rule set via tsgolint) → `pnpm typecheck` (`tsc --noEmit`). ESLint is
gone, the rules are defined in `.oxlintrc.json`, and oxlint honors both
`eslint-disable` and `oxlint-disable` comments.

The tree has **no disable comments**, and should stay that way. A rule that a
whole directory legitimately violates belongs in an `.oxlintrc.json` override,
which replaces a header comment repeated in 44 files. `no-console` is handled
that way: an override turns it off for the CLI and build-script trees
(`genark2jbrowse/src`, `ucsc2jbrowse/src`, `website/generate*.ts`, `scripts/`),
where stdout _is_ the output, and it is on everywhere else.

The tree has no file-scoped overrides either. Every `react/set-state-in-effect`
violation so far turned out to need no effect, and was fixed with a shared
reset-on-change hook, with state derived instead of cleared, or with
`useUrlState`, a `useSyncExternalStore` over the URL. Reach for an override only
after finding that the effect really is the synchronization it looks like.

`.oxfmtrc.json` must keep ignoring `**/.*-uploaded.json`, the
`upload_if_changed` stamps (currently just
`genark2jbrowse/.categories-uploaded.json`). A stamp is a **byte-exact** copy of
the file it tracks, compared with `diff -q`, and the generated
`categoryIndex/categories.json` ends without a trailing newline. If oxfmt added
one to the stamp, every later run would see a change that isn't there, then
re-upload and invalidate CloudFront, forever. Formatting a stamp breaks change
detection as well as the diff.

`pnpm format` / `pnpm check-format` runs `oxfmt` on everything it parses
(ts/tsx/js/json/md/css) **plus prettier on `**/*.astro` only**. Prettier and
`.prettierrc.json` are here only because oxfmt has no astro parser. Keep
`.oxfmtrc.json` and `.prettierrc.json` in sync (same
`semi`/`singleQuote`/`trailingComma`/`arrowParens`/`singleAttributePerLine`), or
JSX formatting differs between `.tsx` and `.astro`.

Every `typescript` in the tree is now **7.x** (the native compiler). Root and
`hubtools` both declare `^7.0.2`, nothing else declares one, and type-aware
oxlint requires 7.x. Know one consequence before "upgrading" anything else:

- `astro check` is **gone**, and with it `@astrojs/check`,
  `@astrojs/language-server` and website's own TypeScript pin. The language
  server drives the TypeScript **JS API**, of which TS 7 exposes too little
  (`Cannot read properties of undefined (reading 'fileExists')`), and it was the
  last package holding a TS 6. As a result `.astro` **frontmatter is no longer
  typechecked**: `tsc` can't parse `.astro`, so root `pnpm typecheck` covers
  `.ts`/`.tsx` only. Put anything type-sensitive in a `.ts`/`.tsx` module the
  page imports. When you move code out of frontmatter, watch for an import of a
  **generated, gitignored** JSON: `tsc` never saw it in frontmatter, and it
  becomes a hard `TS2307` once it is in a `.ts`. That broke CI's typecheck for
  four days from 2026-08-02. Declare such a module in `website/src/global.d.ts`
  instead of teaching CI to generate the file.

`hubtools` pinned 6.x until 2026-08-03, because `tsdown --dts` goes through
`rolldown-plugin-dts`, which failed on TS 7 with
`Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')`.
Commit `a0a9f8c2a2e` lifted the pin, and on 2026-08-05 we checked three things:
`pnpm build` emits with typescript@7.0.2, `dist/index.d.mts` has every export
with real types, and that file typechecks clean under
`tsc --strict --types node`. Re-run those three checks if `tsdown` or
`rolldown-plugin-dts` is bumped. A dts emitter can degrade with no error, so a
passing build does not prove the types survived.

`pnpm typecheck` runs `astro sync` first, because the root tsconfig includes
`website/.astro/types.d.ts`.

tsgolint validates every `tsconfig.json` it loads and is stricter than TS 6 was.
An `outDir` needs an explicit `rootDir`, and tsgolint rejects
`moduleResolution: node` (node10) outright. A tsconfig error there fails
`pnpm lint` before any rule runs.

## Embedding a JBrowse component costs a version split

Until 2026-10-09 the protein browser drew its alignment on the page with
react-msaview 8.x, on MUI 9, mobx 7 and MST 6, while the newest published
`@jbrowse/core` (4.3.0) was on MUI 7, mobx 6 and MST 5. Installed together, the
page loads both copies of each library and the viewer does not render at all.
MobX reports multiple versions, MST refuses the viewer's model, and a MUI 7
theme handed to MUI 9's `ThemeProvider` throws inside react-msaview's error
boundary. To keep it working we used pnpm `overrides` hoisting core onto the
newer four, plus a patch renaming two `HelpOutline` icon imports MUI 9 dropped,
and checked it in a browser in all three states on 2026-08-26.

The page now launches the alignment instead of drawing it, so the overrides, the
patch and every MUI, emotion and mobx dependency are gone (the commit that
removed them has the whole record). Core remains a devDependency for the tests
that evaluate jexl callbacks, on its own MUI 7, which no page renders. Before
embedding any JBrowse component again, expect the split back until core v5
publishes, and check in a browser. Every failure here happens inside an error
boundary, so a green build proves nothing; look for the view drawn and no
console errors from the page.
