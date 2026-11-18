---
name: catch-main-spelling-renames
description:
  About 16 commits in one fortnight chased config spellings JBrowse main had
  renamed. Make check-pangenome-launches and check-config-compat's main host
  fail when main logs that it lifted a legacy key; a WIP start sits on branch
  main-spellings.
metadata:
  category: ready
  area: scripts
  first_move:
    "Rebase main-spellings and check droppedSpellings.mjs's patterns against
    main's current warnings."
  order: 1
---

# Catch JBrowse main's renames automatically

JBrowse `main` lifts an old spelling with only a console line, so a renamed key
ships unnoticed until someone reads the console. About 16 commits in the
2026-11-08 review period chased renamed config spellings by hand.

- **The start:** branch `main-spellings` (three WIP commits, 2026-11-08) adds
  `scripts/droppedSpellings.mjs`, which collects `main`'s dropped-key warnings
  in both `check-pangenome-launches` and `check-config-compat`, and accepts only
  the `init` nesting v4.3.0 needs. Its last commit also rewrites the
  website-refactors handoff, now deleted; drop that part.
- **The shape to keep:** `pangenomeDataset.ts` states intent, and
  `graphVcfTrack` (`pangenomeLinks.ts`) is the only writer of JBrowse spellings.
- **A duplicate to fold in:** the bovine row settings are in both
  `pangenomeDataset.ts` and `bovine-arsucd12.json`.
