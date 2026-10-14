---
name: shell-dead-code-and-shared-skeletons
description:
  Three shell skeletons exist once per pipeline; fold each into one helper.
---

# Shell skeletons both pipelines repeat

- The bed, rmsk and gene derivation scripts share one skeleton. A
  `derive_table_tracks` helper would hold it once, and moves `DERIVATION_HASH`,
  which costs one re-derivation of every UCSC track file (about 56 minutes of
  CPU, bytes unchanged).
- The two `textIndex.sh` files are near-copies.
- The liftOver list/process/stamp loop and the upload-then-invalidate tail each
  exist in both pipelines.

`pangenome-build/` is dead code of the same kind; retiring it is filed with the
pangenome follow-ups.
