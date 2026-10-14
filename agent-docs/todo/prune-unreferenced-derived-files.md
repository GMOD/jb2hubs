---
name: prune-unreferenced-derived-files
description:
  Stop deriving and uploading 13.09 GB the drop rules in
  getTrackModifications.ts discard before any config names it.
metadata:
  category: measure
  area: ucsc2jbrowse
  first_move:
    'Work out why the 118 unexplained files are absent from configs before
    gating anything.'
  order: 1
---

# Prune derived files no config references

`ucsc2jbrowse` derives, stores and uploads **1,814 files / 13.09 GB** that no
config names. Phase 2 runs the derivations off `tracks.json` (the trackDb), and
the drop rules that decide what reaches a config are in
`getTrackModifications.ts`, which runs in Phase 4. Every track the rules drop
therefore still gets its `.bed.gz`/`.gff.gz` built, indexed and synced to the
bucket.

On 2026-08-27, over the 239 built assemblies, three independent methods found
the same 1,814 files and 13.09 GB: a walk of `{uri}` nodes, a raw-text search,
and a db-qualified match against `config.json`, `minimal.json`,
`configs-minimal/`, both staging siblings and the merged `all*.json`.

| family                           | files     | GB        | why it is dropped                              |
| -------------------------------- | --------- | --------- | ---------------------------------------------- |
| `burgeRnaSeqGem*`                | 56        | 5.48      | `specializedParents`                           |
| `pg*`                            | 209       | 5.29      | `specializedTypes` has `pgSnp` (:32, :213)     |
| `encode*`                        | 1349      | 0.83      | prefix rule (:222), beside the `wgEncode*` one |
| `gtexEqtl*`, `agilent*`, `affy*` | 82        | 0.39      | `specializedParents` / `specializedTrackIds`   |
| **provably-dropped subtotal**    | **1,696** | **11.99** |                                                |
| everything else                  | 118       | 1.10      | **not provably junk; see below**               |

hg19 alone accounts for 7.85 GB of the total, and hg18 for 3.80 GB.

## Do not gate on whether a config names the file

The first design gated on config membership, and checking it showed why that
fails. 8 of the "orphans" were `<db>.gff.gz`, the NCBI RefSeq GFF3 for hg38,
hg19, mm39, hs1 and four others. No config named them because
`deriveNcbiAccessions.ts` was emitting zero rows with no error, a bug fixed on
2026-08-27 (see the emptiness gate in `downloadNcbiGff.sh`); nobody had meant to
drop them. A gate keyed on config membership would have deleted the evidence,
and the bug would have stayed with no symptom.

The 118 "everything else" files may be the same kind of bug and are still
unexplained: `augustusGene`, `genscan`, `sgpGene`, `sibGene`, `geneid` and
`lincRNAsTranscripts` are absent from hg38's config, and no drop rule covers
them. **Work out why before deleting any of them.**

## What done looks like

- Derivation skips only what the drop rules provably drop, by mirroring
  `getTrackModifications.ts` instead of reading the config, with a test that
  fails when the two lists diverge, since one copy changing without the other is
  the whole risk.
- The 11.99 GB provably-dropped set is deleted locally, and `rclone sync` then
  removes it from the bucket on the next upload, with no separate delete pass.
- The 118 unexplained files are diagnosed first, and either explained (then
  pruned) or fixed (then referenced).
- The prune ships with its derivation gate. `needs_rebuild` treats a missing
  output as "rebuild", so a prune without a matching derivation gate costs the
  full 12 GB back on the next run.
