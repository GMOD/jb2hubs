# todo

One file per loose end we intend to close. Each states what is wrong, what was
already measured, and what "done" looks like — enough that picking one up does
not mean re-deriving it. Delete the file when the work lands.

Ideas we have not committed to live in [../ideas/](../ideas/). Something that
turns out to be a decision rather than a task belongs in
[../architectural-decision-records/](../architectural-decision-records/).

## Needs the build machine

Neither can be done from an ordinary checkout: the first needs `$UCSC_BUILT_DIR`
to exist, the second needs a full pipeline run.

- [remove-stray-renames-build-dir.md](remove-stray-renames-build-dir.md) —
  `rm -rf "$UCSC_BUILT_DIR/renames"`. `make.sh` now prunes the stray from
  `configs/` and `gate_configs` fails on an orphan, but the built dir is what
  keeps recreating it.
- [exercise-run-sh-strict-mode.md](exercise-run-sh-strict-mode.md) — `run.sh`'s
  `set -euo pipefail` has never run end-to-end

## Before the next upload

- [verify-deduped-plugin-list-in-browser.md](verify-deduped-plugin-list-in-browser.md)
  — `mergeAll`'s 4-entry plugin list has never booted in a browser

## Content and website

- [nh-tree-for-maf-tracks.md](nh-tree-for-maf-tracks.md) — every MAF track
  except hg38's lacks a tree, and the `.nh` is derivable
