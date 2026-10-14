---
name: genark-squash-hubs-history
description:
  No tool reads the git history of hubs/ any more, so we can squash it or move
  hubs/ and ucsc2jbrowse/configs/ to a data repo once the repo size is a
  problem.
---

# Squash `hubs/` history, or move it to a data repo

`hubs/` (52,720 GenArk configs, 260k tracked files, 1.5 GB at HEAD) stays
committed so `git diff` after a run shows what changed
(`agent-docs/reference/GENARK_PIPELINE.md`). No tool has read its **history**
since `genark2jbrowse/hubFirstSeen.json` took over first-seen dates on
2026-09-01.

Neither the website nor the pipeline reads anything that squashing that history
would remove, or that moving `hubs/` and `ucsc2jbrowse/configs/` into a sibling
data repo would take away. The number that decides it is the repo's size on
GitHub, 1.2 GB on 2026-09-01, and how fast it grows now that the builder writes
oxfmt's format directly and corpus-wide reflows no longer happen. At that
measurement `git status` took 1.4 s and `git diff --stat hubs/` 4.8 s.
