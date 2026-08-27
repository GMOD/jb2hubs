# todo

One file per loose end we intend to close. Each states what is wrong, what was
already measured, and what "done" looks like — enough that picking one up does
not mean re-deriving it. Delete the file when the work lands.

Ideas we have not committed to live in [../ideas/](../ideas/). Something that
turns out to be a decision rather than a task belongs in
[../architectural-decision-records/](../architectural-decision-records/).

## Pipeline and build

- [cloudfront-invalidation-frequency.md](cloudfront-invalidation-frequency.md) —
  invalidations are billed per path; gate them on real changes
- [dedupe-download-ncbi-gff-gate.md](dedupe-download-ncbi-gff-gate.md) — one
  re-download gate written twice, in two `downloadNcbiGff.sh`
- [parallel-failures-are-swallowed.md](parallel-failures-are-swallowed.md) —
  `parallel … || true` needs count-and-report, not removal
- [exercise-run-sh-strict-mode.md](exercise-run-sh-strict-mode.md) — `run.sh`'s
  `set -euo pipefail` has never run end-to-end
- [prune-orphaned-configs.md](prune-orphaned-configs.md) — `configs/` is
  append-only, which is how a stray file survived a year

## Before the next upload

- [remove-stray-renames-build-dir.md](remove-stray-renames-build-dir.md) —
  `rm -rf "$UCSC_BUILT_DIR/renames"`, still not done
- [verify-deduped-plugin-list-in-browser.md](verify-deduped-plugin-list-in-browser.md)
  — `mergeAll`'s 4-entry plugin list has never booted in a browser

## Outage resilience

- [offline-ucsc-drill.md](offline-ucsc-drill.md) — an `--offline-ucsc` canary
  mode, so the drill runs every 6 hours instead of never

## Content and website

- [nh-tree-for-maf-tracks.md](nh-tree-for-maf-tracks.md) — every MAF track
  except hg38's lacks a tree, and the `.nh` is derivable
- [shrink-ortholog-index.md](shrink-ortholog-index.md) — 4.34 MB where 672 KB
  would do
- [name2-not-shown.md](name2-not-shown.md) — undiagnosed, with a repro link
