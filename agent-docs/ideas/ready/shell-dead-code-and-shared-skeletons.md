---
name: shell-dead-code-and-shared-skeletons
description:
  788 GB of vs PIFs sit unused in the UCSC built tree, and three shell skeletons
  exist once per pipeline.
---

# Shell review leftovers

The 2026-09-26 review of the repo's shell fixed 15 bugs the same day, and the
dead scripts it named were deleted on 2026-10-08. Two things remain.

## 788 GB of `vs` PIFs nothing builds, reads or uploads

`$UCSC_BUILT_DIR/<db>/vs/` exists for 218 assemblies on ada, 788 GB in all,
written in July 2025 by the `vs` source `createChainTrackPifs.sh` no longer has
(ADR 0004 records why). `uploadAll.sh` keeps them out of the bucket with
`--exclude "*/vs/*"`. Delete the directories first and the exclude second:
without the exclude, the next sync uploads all 788 GB.

`pangenome-build/` is the same kind of leftover, and
`agent-docs/reference/PANGENOME_PORTAL.md` already makes retiring it the
default.

## Repeated

- The bed, rmsk and gene derivation scripts share one skeleton. A
  `derive_table_tracks` helper would hold it once, and moves `DERIVATION_HASH`,
  which costs one re-derivation of every UCSC track file (about 56 minutes of
  CPU, bytes unchanged).
- The two `textIndex.sh` files are near-copies.
- The liftOver list/process/stamp loop and the upload-then-invalidate tail each
  exist in both pipelines.
