# Prune derived files no config references

`ucsc2jbrowse` derives, stores and uploads **1,814 files / 13.09 GB** that no
config names. The derivations run in Phase 2 off `tracks.json` (the trackDb),
while the drop rules that decide what reaches a config live in
`getTrackModifications.ts` and run in Phase 4 — so every track the rules drop
still gets its `.bed.gz`/`.gff.gz` built, indexed, and synced to the bucket.

Measured 2026-08-27 over the 239 built assemblies, three independent ways (walk
of `{uri}` nodes; raw-text mention; db-qualified match against `config.json`,
`minimal.json`, `configs-minimal/`, both staging siblings and the merged
`all*.json`) — all three agree on 1,814 / 13.09 GB.

| family                           | files     | GB        | why it is dropped                              |
| -------------------------------- | --------- | --------- | ---------------------------------------------- |
| `burgeRnaSeqGem*`                | 56        | 5.48      | `specializedParents`                           |
| `pg*`                            | 209       | 5.29      | `specializedTypes` has `pgSnp` (:34, :232)     |
| `encode*`                        | 1349      | 0.83      | prefix rule (:241), beside the `wgEncode*` one |
| `gtexEqtl*`, `agilent*`, `affy*` | 82        | 0.39      | `specializedParents` / `specializedTrackIds`   |
| **provably-dropped subtotal**    | **1,696** | **11.99** |                                                |
| everything else                  | 118       | 1.10      | **not provably junk — see below**              |

hg19 alone is 7.85 GB of the total, hg18 3.80 GB.

## Do not gate on "the config does not name it"

That was the first design and it is wrong, for a reason found while checking it:
8 of the "orphans" were `<db>.gff.gz`, the NCBI RefSeq GFF3 for hg38, hg19,
mm39, hs1 and four others — unreferenced because `deriveNcbiAccessions.ts` was
silently emitting zero rows, not because anyone meant to drop them (fixed
2026-08-27; see the emptiness gate in `downloadNcbiGff.sh`). A gate keyed on
config membership would have deleted the evidence and made that bug permanent
and invisible.

The 118 "everything else" rows are the same shape and still unexplained —
`augustusGene`, `genscan`, `sgpGene`, `sibGene`, `geneid`, `lincRNAsTranscripts`
are absent from hg38's config with no drop rule that covers them. **Work out why
before deleting any of them.**

## What done looks like

- Derivation skips only what the drop rules provably drop, mirroring
  `getTrackModifications.ts` rather than observing the config — with a test that
  fails when the two lists drift, since the whole hazard is one copy moving.
- The 11.99 GB provably-dropped set is deleted locally; `rclone sync` then
  removes it from the bucket on the next upload, no separate delete pass.
- The 118 unexplained files are diagnosed first, and either explained (then
  pruned) or fixed (then referenced).
- Nothing re-derives what it just pruned: `needs_rebuild` treats a missing
  output as "rebuild", so a prune without a matching derivation gate costs the
  full 12 GB back on the very next run.
