# Shell review, 2026-09-26: what's fixed and what's left

A review of all 6,400 lines of shell found the bugs below. Default-level
shellcheck was already clean; `-o all` flagged only the SC2310/SC2312 class, and
the one site where that bites is item 1. Items marked **verified** were checked
against the code by hand. The reviewers reproduced most of the rest with stubs.

## Landed

`lib/derive.sh` (`28aff8dcb19`) holds what decides a derived file's bytes: the
`LC_ALL`, `JBROWSE_CLI`, `needs_rebuild`, `save_rebuild_stamp`, `sort_if_needed`
and bgzip-guard code. `ucsc2jbrowse/make.sh` hashes it instead of all of
`lib/common.sh`, so editing the upload or flag code no longer re-derives 238
assemblies. An empty stamp now reads as stale, and `save_rebuild_stamp` refuses
to stamp when it cannot hash the source. The `lib/common.test.sh`,
`lib/chainpif.test.sh` and `ucsc2jbrowse/common.test.sh` suites pass on ada with
`BGZIP_STRICT=1`.

**The next `run.sh` re-derives every UCSC track file once**, because
`DERIVATION_HASH` moved. The toolchain is unchanged, so the bytes come out the
same and `rclone -c` re-sends nothing. The cost is about 56 minutes of CPU. The
bed/rmsk/gene fixes in item 6 move the same hash, so land them before that run
and pay the cost once.

## Bugs

Fixed on 2026-09-26, second session, one commit each, all six shell suites
passing on ada with `BGZIP_STRICT=1` plus a new
`genark2jbrowse/fetchNcbiMetadata.test.sh`:

1. A failed rclone pass fails `rclone_sync_with_indexes`, and a failed data pass
   skips the index pass.
2. `_run_assembly_jobs` records failed assemblies in `ASSEMBLY_FAILURES_FILE`;
   ucsc `make.sh` leaves them unstamped and does not advance `.derivation_hash`
   after a re-derivation with failures.
3. `fetchNcbiMetadata.sh` writes `ncbi.json.notfound` only for accessions from
   an answered batch.
4. run.sh's `Updates` add, check and commit share one path list.
5. `chain_to_paf` decides "corrupt" with `pigz -t` on the failure path.
6. `write_indexed_gz` (`lib/derive.sh`) bgzips and indexes under a temp name and
   swaps the pair in; the bed, rmsk, gene and ucsc NCBI GFF writes use it. The
   ucsc upload excludes intermediates and temp names.
7. `create_pif` drops the `.cli` stamp before rebuilding; `copy_pif_files`
   copies through temp names.
8. `run.sh --explain` forwards `--all`/`--reprocess-all`.
9. GenArk drops `.checked` for moved hub.txt files on every run; UCSC's
   `.checked` ages out after `LIFTOVER_RECHECK_DAYS` (30).
10. The hub.txt rsync takes `--ignore-missing-args`.
11. Both PIF gates load the CLI-version memo in the parent shell; an empty
    `--version` is an error.
12. Deadlines on every fetch listed, and `--timeout=600` on the rsyncs.
13. Not fixed, see below.
14. `deploy.sh` compares plain `readlink`, removes a partial release, and runs
    the remote `zstd -d | tar` under pipefail.
15. All six small ones.

**The next `run.sh`** re-derives every UCSC track file once (the
`DERIVATION_HASH` move, now including item 6; output bytes unchanged) and
re-lists every UCSC liftOver directory once the `.checked` stamps pass 30 days.
The next `buildHprcSvStates.sh` downloads the callset again, because the cache
is now keyed by its basename.

Still open:

- **`makePifs.sh` visits only rsynced download dirs**, so hub-backed UCSC
  assemblies (hs1, rn8, …) get no liftOver PIFs. Check how the deleted
  `processHs1LiftOver.sh` found their chains before changing it.
- An ssh failure during `deploy.sh`'s verification step still exits under
  `set -e` and leaves the partial release.

## Simplifications

- **Orphaned or dead:**
  - `genark2jbrowse/cleanupStaleGff.sh`: nothing calls it, and it looks in
    `bgz/` instead of `gff/`.
  - `ucsc2jbrowse/reprocessGeneTracks.sh`: skips the bgzip guard, and
    `DEVELOPERS.md` documents a `--reindex` flag it rejects.
  - The `vs` path in `ucsc2jbrowse/createChainTrackPifs.sh`, plus its
    `uploadAll.sh` exclude: dead since ADR 0004.
  - `accession_to_hub_dir`.
  - The `SCOPE_FILE` argument that make.sh never passes.
- **`pangenome-build/` feeds nothing** now that the MSA panel is gone.
  `agent-docs/PANGENOME_PORTAL.md` already asks "retire or finish". That is
  Colin's call.
- **Could be shared:**
  - The bed/rmsk/gene scripts repeat one skeleton. A `derive_table_tracks`
    helper would fix item 6 in one place, but it moves `DERIVATION_HASH`.
  - The two `textIndex.sh` files are near-copies.
  - The liftOver list/process/stamp loop and the upload-then-invalidate tail
    each exist in both pipelines.

## CLAUDE.md

At 20,600 words, CLAUDE.md loads into every session. Colin asked to trim it and
to drop the version-specific notes. Keep the rules, invariants and traps, and
move the incident narratives and dated measurements that justify them to
`agent-docs/` (or drop them, since git has them). Examples of the drift found:

- It says the pinned CLI is `5.0.0-beta.2`, but `package.json` pins `beta.7`.
- It puts `seqids_resolve` in `downloadNcbiGff.sh`; it is now `seqidsResolve` in
  `src/addNcbiRefSeqGffTrack.ts`.
- It says the whole `deploy.sh` remote side runs under pipefail.
- It says a failed GFF fetch is classified with a HEAD request; the code uses
  the GET's own status.
- `lib/common.sh` comments still say genark uses `wget -N`, and run.sh's help
  says genark processes only new or changed hubs.
