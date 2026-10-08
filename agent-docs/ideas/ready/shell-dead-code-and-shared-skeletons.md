---
name: shell-dead-code-and-shared-skeletons
description:
  Three shell skeletons exist once per pipeline, left by the 2026-09-26 shell
  review.
---

# Shell skeletons both pipelines repeat

The 2026-09-26 review of the repo's shell fixed 15 bugs the same day. The dead
scripts it named, and the 788 GB of `vs` PIFs in the UCSC built tree, were
deleted on 2026-10-08. What remains is duplication.

- The bed, rmsk and gene derivation scripts share one skeleton. A
  `derive_table_tracks` helper would hold it once, and moves `DERIVATION_HASH`,
  which costs one re-derivation of every UCSC track file (about 56 minutes of
  CPU, bytes unchanged).
- The two `textIndex.sh` files are near-copies.
- The liftOver list/process/stamp loop and the upload-then-invalidate tail each
  exist in both pipelines.

`pangenome-build/` is a leftover of the same kind as the deleted scripts, and
`agent-docs/reference/PANGENOME_PORTAL.md` already makes retiring it the
default.
