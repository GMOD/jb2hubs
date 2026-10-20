---
name: prune-unreferenced-derived-files
description:
  Delete the 1,803 derived files (12.56 GB) the drop rules in
  getTrackModifications.ts discard, now that derivation skips them.
metadata:
  category: ready
  area: ucsc2jbrowse
  first_move:
    'After one run.sh with the derivation gate, delete the 1,803 files and their
    .csi/.hash.'
  order: 1
---

# Prune derived files no config references

`ucsc2jbrowse` derived, stored and uploaded **1,803 files / 12.56 GB** that no
config names, mostly on hg16–hg19. Every one belongs to a table that a rule in
`getTrackModifications.ts` drops (scan of 2026-10-20):

| rule                               | files |
| ---------------------------------- | ----- |
| trackId starts `encode`/`wgEncode` | 1,349 |
| `specializedParents`               | 237   |
| parent starts `pgSnp`              | 209   |
| `specializedTrackIds`              | 8     |

## The gate

`src/keptTables.ts` runs each `tracks.json` key through the extension merge,
`withTrackDbMetadata` (shared with `addMetadata`) and the drop rules, and prints
the keys that survive. `derivable_keys` in `common.sh` filters the bed, gene and
rmsk derive loops by it, after `is_skipped_track`, which still covers `snp*`.

On 2026-10-20 the gate removed exactly the scan's 1,803 files from the 5,788 the
derive scripts would process, and a scratch config build matched main's byte for
byte.

The three derive scripts are in `DERIVATION_SOURCES`, so the gate's commit moves
`DERIVATION_HASH` and the next run re-derives every file. The commit changes
only which keys the loops visit, which is the whole-corpus argument for
advancing `.derivation_hash` by hand instead.

## Do not gate on whether a config names the file

On 2026-08-27, 8 "orphans" were `<db>.gff.gz`, the NCBI RefSeq GFF3, absent from
configs because `deriveNcbiAccessions.ts` emitted zero rows with no error. A
gate keyed on config membership would have deleted the evidence. The gate reads
the drop rules, never the config.

## Remaining

- After one `run.sh` with the gate, delete the 1,803 files and their
  `.csi`/`.hash` locally; the next upload's `rclone sync` removes them from the
  bucket.
- Feed the trackDb `type` column into `metadata.ucsc.type`. The rules read
  `ucsc.type` from the settings blob, and no entry in hg19's `tracks.json` has a
  `type` line there, so `specializedTypes` and the `bigMaf` rules never fire on
  a golden-path table. The change can alter configs, so diff a scratch build.
