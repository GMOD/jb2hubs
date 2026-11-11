---
name: website-refactors
description:
  What is left of the 2026-11-08 eight-agent review of website/ and its last 300
  commits. The bugs and most of the structural work have landed; two items
  remain (catching JBrowse main renames automatically and the leftover memo
  hooks), each with the files to start at, the trap to respect and the check
  that proves it.
---

# Website refactors left from the 2026-11-08 review

Eight read-only reviewers covered pangenome UI, pangenome data, protein browser,
synteny and gene order, gene and orthologs, the core pages, cross-cutting code,
and the history of the last 300 commits touching `website/`. The bugs they found
landed in `9af3a6a12fa8`..`8a1009be3432`, the pangenome items in
`808f72c9dccb`..`5f291e6bddbf`, the structural items in
`222aa8acb066`..`439322b476f1`, and the gene-order chain paths and the last
small cleanups in `195fbae1df80`..`50520c6bb97a`. Everything below is unstarted.

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

## Pangenome

- **The next `buildHprcGenes.sh` run rebuilds the HPRC gene models** (about 20
  minutes on ada): its `CONVERTER_HASH` names the moved paths and
  `pangenomeGff3.ts`. Only a CAT or Liftoff value with a `%XX` escape can come
  out different.
- **Not needed:** making per-dataset branching data-driven. No `dataset.id` if
  chains exist.

## Cross-cutting

- **Catch JBrowse `main` renames automatically.** About 16 commits this period
  chased renamed config spellings by hand. Make `check-pangenome-launches` and
  `check-config-compat`'s `main` host fail when `main` logs that it lifted a
  legacy key. Keep `pangenomeDataset.ts` to intent and let `graphVcfTrack`
  (`pangenomeLinks.ts`) be the only writer of JBrowse spellings. The bovine row
  settings are duplicated in `pangenomeDataset.ts` and `bovine-arsucd12.json`.

## Small, take when touching the file

- Leftover `useMemo`/`useCallback` under the React Compiler (20 of them, in nine
  files): remove each only where the compiler is confirmed to compile that
  component.
  - **Trap:** `SyntenySelector.tsx`'s `queryGeneOptions` callback is
    load-bearing, because `Autocomplete` asks again whenever its identity
    changes.
- House style: explicit return types and early returns throughout.
- Pinning `@jbrowse/graph-walks` exactly (each major reads one walk format)
  conflicts with the user's always-latest rule (memory: `deps-always-latest`).
  Don't do it; let `check-pangenome-launches` catch a format change.

Delete this file once the items above have landed or moved to `ideas/`.
