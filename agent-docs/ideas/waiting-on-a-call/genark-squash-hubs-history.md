---
name: genark-squash-hubs-history
description:
  No tool reads the git history of hubs/ any more, so we can squash it or move
  hubs/ and ucsc2jbrowse/configs/ to a data repo. The repo nearly doubled on
  GitHub in eleven weeks, 1.2 GB to 2.2 GB.
---

# Squash `hubs/` history, or move it to a data repo

`hubs/` (52,720 GenArk configs, 260k tracked files, 1.5 GB at HEAD) stays
committed so `git diff` after a run shows what changed
(`agent-docs/reference/GENARK_PIPELINE.md`). No tool has read its **history**
since `genark2jbrowse/hubFirstSeen.json` took over first-seen dates on
2026-09-01.

Neither the website nor the pipeline reads anything that squashing that history
would remove, or that moving `hubs/` and `ucsc2jbrowse/configs/` into a sibling
data repo would take away. The repo's size on GitHub was 1.2 GB on 2026-09-01
and 2.2 GB (`gh api repos/…` `size`, 2,196,607 KB) on 2026-11-18, although the
builder writes oxfmt's format directly and corpus-wide reflows no longer happen.
On 2026-09-01 `git status` took 1.4 s and `git diff --stat hubs/` 4.8 s.
Squashing rewrites main's history under every clone and open worktree, so it is
Colin's call.
