- check that aws create-invalidation run less
- optimize lint and format speed somehow
- MAF tracks. Re-checked 2026-08-08 and most of this item was already stale, so
  what is actually left is smaller than it read:
  - **Done:** the 4 chainNet `.net.bb` tracks mistyped as MafTrack are dropped
    (`getTrackModifications.ts`, `CHAIN_NET_SUBTRACK`). They were pairwise nets
    typed `bigMaf` by UCSC, converted into one-row MafTracks with sample lists
    parsed out of a setting that is not a species list.
  - **Already true:** `createTrackConfiguration.ts` does emit `samples` (via
    `mafSamplesFromSpeciesOrder`) and does resolve `data.frames` into
    `annotationAdapter`, as does the golden-path twin `buildBigMafTrack.ts`.
  - **Still open:** `nhLocation` is emitted by neither builder. hg38's three
    trees are hand-written in `ucscMixins/hg38.json`, so every other assembly's
    MAF track has no tree sidebar and no way to get one. UCSC ships the `.nh`
    next to the alignment under a predictable name, so this is derivable in both
    builders rather than a per-assembly mixin.
  - Sample wiring is step one for MAF row → genome navigation,
    `agent-docs/MAF_CROSS_VIEW_NAVIGATION.md`

Left over from the shell-hardening review, whose handoff doc is gone now that
items 1–5 have shipped (`run.sh` `set -euo pipefail`, the `--upload-only` +
`--reprocess-all` rejection, the scoped `git add -A --` allowlist, the
control-plane doc block, and `parse_flags` owning the shared flags):

- Two near-duplicate `downloadNcbiGff.sh` (genark + ucsc). Different downloaders
  (`wget -N` vs `datasets download`) but the same re-download gate
  (`FETCH_UPDATES` / file-existence), so they will drift. Minimum a
  cross-reference comment; better, lift the gate decision into `lib/common.sh`.
- `parallel … || true` on the genark chain PIFs (`genark2jbrowse/make.sh` ~156,
  ~160, ~164, and `ucsc2jbrowse/makePifs.sh`) hides a persistent failure as
  cleanly as it absorbs a one-off. Tolerating partial failure across a 50k-hub
  sweep is probably deliberate, so this wants a count-and-report rather than a
  bare removal. The other half of that item —
  `git commit … || echo "no changes"` reporting any commit failure as "nothing
  to commit" — is **done**: both sites in `run.sh` now gate on
  `git diff --cached --quiet`.
- `run.sh`'s `set -euo pipefail` has never been exercised end-to-end. One real
  `./run.sh --dry-run` on the deploy box would confirm no `-u` path fires that a
  static read cannot reach.

## Surviving a UCSC outage

Motivation: hg19/hg38 must not hang when hgdownload is down. As of 2026-08-05
they already don't — all three `loadPre()` sidecars are mirrored and were
confirmed live in the bucket (HTTP 200, non-empty), and `check-sidecar-urls`'s
`MUST_BE_LOCAL` now fails the pre-upload gate if that regresses. These are what
is left, in the order I'd do them.

- **Make the outage drill repeatable.** The check added to `check-sidecar-urls`
  proves a config _names_ local files; nothing proves the app actually opens
  without UCSC, and the 6-hourly canary boots against a working hgdownload so it
  stays green until the outage itself. `scripts/checkConfigCompat.mjs` already
  calls `page.setRequestInterception(true)`, so an `--offline-ucsc` mode that
  aborts every request to `hgdownload.soe.ucsc.edu` and then asserts hg38/hg19
  still open is small (~40 lines against existing code). Wire it into
  `config-canary.yml` and a regression surfaces within 6 hours — including one
  that originates outside this repo.
- **Decide whether to mirror the hg19 + hg38 2bits.** `hg38.2bit` is 797 MB and
  `hg19.2bit` 778 MB: **1.5 GB, 2 objects**. This is the last UCSC dependency
  for those two, and during an outage it is the one visibly broken thing (the
  assembly opens, the sequence track does not). ADR 0003 rejects mirroring
  2bits, but that was about doing it across all 238 assemblies, and what
  actually killed the GenArk sweep was object count (101,384), which two objects
  does not approach. A different decision from the one the ADR made, so it wants
  an explicit answer rather than an assumption either way.
- **Prune `configs/` instead of only documenting it.** `make.sh` copies
  `$UCSC_BUILT_DIR/<db>/config.json` to `configs/<db>.json` and never removes
  anything, which is how `renames.json` survived a year and put four `unpkg.com`
  plugin urls into `all.json`. Deleting the file fixed the symptom. Either a
  prune step in `make.sh` (drop a `configs/<db>.json` with no matching built
  dir) or an orphan assertion in `gate_configs` fixes the cause. `hgFixed` is
  the one legitimate extra.
- **GenArk still fails whole during an outage** — 50,701 assemblies, no
  protection, and nothing checks their ~101k upstream sidecar urls either
  (`check-sidecar-urls` is UCSC-only on purpose). Partly mitigated already: the
  highest-traffic GenArk genomes are the UCSC-aliased ones (`rn8` and friends),
  which get a mirrored UCSC-side config. If this is ever revisited, note that of
  the three options in ADR 0003's amendment only the CloudFront-origin proxy
  avoids putting tens of thousands of objects back in the bucket, since it
  stores nothing.

## Before the next upload

- Run `pnpm check-config-compat`. `mergeAll` now emits a deduped plugin list (4
  entries where it used to emit 12), and that has been verified structurally and
  by unit test but never booted in a real browser.
- **`rm -rf "$UCSC_BUILT_DIR/renames"` on the build machine.** This is the one
  that matters, and it has not been done: the 2026-08-05 deletion treated the
  symptom, and by 2026-08-08 `renames.json` was back in **both** trees
  (`configs/` and `configs-minimal/`). Deleted again, but nothing stops a third
  return except this line.

  It no longer comes back silently, at least. `checkPluginUrls.mjs` now fails on
  any file in those directories whose `assemblies[0]` has no name, which is what
  a swept-up `ucscRenames/hg38.json` looks like, and it is in `gate_configs` so
  it runs before every upload. The plugin check alone could never catch it: all
  four of its unpkg.com urls fetched fine and defined their globals.

  The only visible symptom for a year was that the script logged
  `scanned 476 ucsc configs` while walking 478. That number is now counted
  rather than written down.
