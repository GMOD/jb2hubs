---
name: shell-dead-code-and-shared-skeletons
description:
  The 2026-09-26 shell review left five dead scripts or paths and three
  skeletons both pipelines repeat.
---

# Shell review leftovers

The 2026-09-26 review of the repo's 6,400 lines of shell fixed 15 bugs the same
day. Every item below was still in the tree on 2026-10-08.

## Dead

- `genark2jbrowse/cleanupStaleGff.sh`: nothing calls it, and it looks in `bgz/`
  where the downloads are in `gff/`.
- `ucsc2jbrowse/reprocessGeneTracks.sh`: skips the bgzip guard, and
  `DEVELOPERS.md` documents a `--reindex` flag the script rejects.
- The `vs` source in `ucsc2jbrowse/createChainTrackPifs.sh`, with its
  `uploadAll.sh` exclude: dead since ADR 0004.
- `accession_to_hub_dir` in `genark2jbrowse/common.sh`: defined and exported,
  never called.
- The `SCOPE_FILE` argument of `genark2jbrowse/deriveGeneticCodes.sh`,
  `downloadNcbiGff.sh` and `processGffFiles.sh`: `make.sh` never passes it.

`pangenome-build/` is the sixth, and `agent-docs/reference/PANGENOME_PORTAL.md`
already makes retiring it the default.

## Repeated

- The bed, rmsk and gene derivation scripts share one skeleton. A
  `derive_table_tracks` helper would hold it once, and moves `DERIVATION_HASH`,
  which costs one re-derivation of every UCSC track file (about 56 minutes of
  CPU, bytes unchanged).
- The two `textIndex.sh` files are near-copies.
- The liftOver list/process/stamp loop and the upload-then-invalidate tail each
  exist in both pipelines.
