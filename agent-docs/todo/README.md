# todo

One file per loose end we intend to close. Each states what is wrong, what was
already measured, and what "done" looks like — enough that picking one up does
not mean re-deriving it. Delete the file when the work lands.

Ideas we have not committed to live in [../ideas/](../ideas/). Something that
turns out to be a decision rather than a task belongs in
[../architectural-decision-records/](../architectural-decision-records/).

- [exercise-run-sh-strict-mode.md](exercise-run-sh-strict-mode.md) — `run.sh`'s
  `set -euo pipefail` has never run end-to-end. Needs the build machine, and the
  next full regeneration is the cheapest time to get it: the `hubtools/src` and
  `lib/common.sh` changes of 2026-08-27 move `.pipeline_hash`, so the next
  `make.sh` re-derives every config anyway.
