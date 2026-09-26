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

## Bugs, most important first

1. **A failed rclone upload reports success** (verified). `lib/common.sh`
   `rclone_sync_with_indexes` runs inside `changed=$(…)`, which turns off
   errexit. A failed data pass is ignored, the index pass still uploads new
   `.csi` files next to old `.gz` files, and run.sh deploys. Fix: check
   `PIPESTATUS[0]` after each `rclone | tee` and return 1, and never start the
   index pass after a failed data pass. Affects both `uploadAll.sh` and both
   `buildHprc*.sh`. Add a stub-rclone test.
2. **A failed UCSC table job is stamped as done** (verified).
   `run_for_assemblies_lenient` only warns, then `ucsc2jbrowse/make.sh` writes
   `.pipeline_hash`/`.trackdb_hash` for every changed assembly, failed ones
   included. `_assembly_job`'s `set -e` also skips every table after the failing
   one. Nothing revisits them until upstream or the code changes. Fix:
   `_run_assembly_jobs` writes the failed dirs (joblog Exitval ≠ 0) to a file,
   and make.sh skips their stamps. Don't write `.derivation_hash` while REDERIVE
   is set and the failure list is non-empty.
3. **An NCBI outage marks every queued hub "not found" for 90 days** (verified).
   `genark2jbrowse/fetchNcbiMetadata.sh` writes `ncbi.json.notfound` for every
   accession without a result, including ones whose batch never got an answer.
   Fix: write the sentinel only for accessions whose batch was answered, and
   check `process_batch_result`'s status explicitly (it runs under `if !`, so
   errexit is off).
4. **The final `Updates` commit takes the whole index** (verified). In `run.sh`
   the `git add -A -- <paths>` is scoped, but `git diff --cached --quiet` and
   `git commit -m Updates` are not. Scope both to the same path array.
   `genark2jbrowse/hubs` is a symlink to `../hubs`, so check it before listing
   it.
5. **A good chain can be treated as corrupt and fetched again on every run**
   (verified). In `lib/chainpif.sh` `chain_to_paf`, an early `chain2paf` exit
   SIGPIPEs pigz, so `PIPESTATUS[0] != 0` returns 2. Decide on the failure path
   with `pigz -t` instead, and test with an early-exiting stub on a
   multi-megabyte input.
6. **A rebuilt `.gz` can keep its old index.** The bed, rmsk and gene scripts
   overwrite `out.gz` in place, then run `tabix`. If tabix refuses, the old
   `.csi` stays, and `check-tabix-indexes` only checks that one exists. Remove
   the index first, or build under a temp name and `mv` both.
   `ucsc2jbrowse/downloadNcbiGff.sh` also writes through the hard link the built
   dir shares, so an interrupted fetch truncates the built copy too. Failed jobs
   also leave `*.tmp`/`.bed`/`.isoforms.txt` intermediates that `uploadAll.sh`
   publishes.
7. **An interrupted PIF rebuild counts as current.** `create_pif` rewrites the
   PIF while the old `.cli` stamp and `.csi` survive, and `copy_pif_files` is a
   plain `cp`. Write to temp names and `mv`.
8. **`./run.sh --all --explain` describes an incremental run.** The explain
   block runs before `BUILD_FLAGS` is built, so forward the flags.
9. **New chains can be missed.** GenArk: if a run copies hub.txt files and dies
   before the `git status` step that deletes `liftOver/.checked`
   (`genark2jbrowse/make.sh:90`), the stamps survive, so run that step
   unconditionally. UCSC: nothing clears `.checked`, so give it a TTL through
   `stamp_age_days`.
10. **One vanished hub.txt aborts the GenArk run.** The `rsync -t --files-from`
    in `genark2jbrowse/make.sh` lacks `--ignore-missing-args`.
11. **The CLI-version memo never reaches the `parallel` jobs.**
    `load_jbrowse_cli_version` first runs inside a `while` in a pipe subshell,
    in both `genark2jbrowse/make.sh` and `ucsc2jbrowse/makePifs.sh`. After a CLI
    bump that is 52k `node jbrowse --version` starts. Call it in the parent
    before the pipeline, and fail when `--version` prints nothing.
12. **No deadlines on several hgdownload fetches**: `download_file`'s wget (900s
    × 20 tries), `extract_file_urls`' curl, the rsyncs in
    `listUpstreamHubs.sh`/`xenoSymbolIndex.sh`/genark `make.sh`, and run.sh's
    curl.
13. **`makePifs.sh` visits only rsynced download dirs**, so hub-backed UCSC
    assemblies (hs1, rn8, …) get no liftOver PIFs. Check how the deleted
    `processHs1LiftOver.sh` found their chains before changing it.
14. **`website/deploy.sh` can prune the live release.** `readlink -f` resolves
    symlinks that `find` does not, so the two paths stop matching if `/var/www`
    is ever a symlink. Use plain `readlink`. A partial release left by a failed
    deploy also blocks `--rollback`. The remote `zstd -d | tar -x` has no
    pipefail.
15. **Smaller ones:**
    - A failed staging deploy aborts before the summary and push.
    - `pangenome-build/run.sh` exits 1 without `--graph`.
    - `buildHprcSvStates.sh` caches the VCF under a fixed name, so a new callset
      would publish the old one.
    - `pangenome-config/upload.sh` skips the invalidation after a partial
      failure.
    - The genome-list `curl` in ucsc make.sh has no `-f`.
    - `createGeneTracksForGoldenPath.sh` reads `tracks.json` without the `-f`
      guard the other two scripts have.

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
