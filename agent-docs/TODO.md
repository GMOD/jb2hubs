- check that aws create-invalidation run less
- optimize lint and format speed somehow
- MAF tracks: `createTrackConfiguration.ts` drops `data.frames`, never emits
  `samples`/`nhLocation`; 4 chainNet `.net.bb` tracks are mistyped as MafTrack.
  Fixing the sample wiring is also step one for MAF row → genome navigation —
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
