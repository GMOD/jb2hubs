# Handoff: run.sh / common.sh shell hardening

## Where this stands

An integrity review of the orchestration scripts (`run.sh`, both `make.sh`, the
three `common.sh` layers) produced 7 ranked gaps. Items **1–4 are done** (commit
`abc3ad93462` on branch `derive`, "harden run.sh deploy path"; docs updated in
`DEVELOPERS.md`). Items **5–7 are deferred** and described below so the next
agent can pick them up.

## What shipped (items 1–4)

1. **`run.sh` now uses `set -euo pipefail`** (was bare `set -e`), matching both
   `make.sh`. Verified safe: every variable referenced in `run.sh` is assigned
   before use, so `-u` surfaces nothing latent, and there are no unguarded pipes
   for `pipefail` to trip on. `bash -n` clean.
   - **Not yet exercised end-to-end.** Run one real `./run.sh --dry-run` on the
     deploy box to confirm no `-u` path fires that a static read can't reach.

2. **`--upload-only` + `--reprocess-all` is now rejected** instead of silently
   ignoring the reprocess (upload-only skips the whole build phase).

3. **The final deploy `git add .` is now a scoped allowlist** (`git add -A --`
   of the pipeline-generated paths), so stray working-tree edits no longer ride
   along to origin under the generic "Updates" commit. Allowlist:
   `genark2jbrowse/{hubs,taxon_images,processedHubJson,speciesDescriptions}`,
   `ucsc2jbrowse/{configs,configs-minimal,blockedFiles,removedTracks,blockedFiles.json,removedTracks.json,fileListing.txt}`,
   `website/src/*.json`. (`hubs/` is committed separately earlier in the
   script.)
   - Confirmed by test: an in-scope new file stages; strays at repo root and in
     `agent-docs/` do not.
   - **If you add a new generated output dir, add it to this allowlist** or it
     silently stops being committed. This is the one maintenance cost of the
     change vs. `git add .`.

4. **`REPROCESS` / `FETCH_UPDATES` control plane documented canonically** in
   root `common.sh` (the single file both pipelines source) and surfaced in
   `run.sh --help` + `DEVELOPERS.md`. The model: `REPROCESS` re-derives from
   cached downloads; `FETCH_UPDATES` re-pulls upstream NCBI GFFs; they are
   independent and compose.

## Deferred (items 5–7) — the real follow-up refactor

5. **DONE** (option b). `parse_flags` in root `common.sh` owns `--all`,
   `--reprocess-all` and `--help` for all three entry points; a script adds its
   own flags by defining `handle_flag`, which returns non-zero for anything it
   doesn't recognise. The shared help text (common flags plus the `REPROCESS` /
   `FETCH_UPDATES` control plane) is printed by `parse_flags`, so the three
   `--help` outputs can't drift. `ucsc` gained `--all` as a first-class flag
   (`--skip-download` still implies it); `run.sh` gained `--all` and forwards
   the shared flags to both pipelines. Covered by tests in `common.test.sh`.
   - Option (a)'s two extras were deliberately **not** added, because both
     duplicate existing workflows rather than enabling new ones: `--only
     genark|ucsc` is `./ucsc2jbrowse/make.sh && ./run.sh --upload-only`, and a
     `--skip-download` passthrough has no coherent meaning for genark, whose
     download phase produces the new-hub list its incremental mode runs on.

6. **Two near-duplicate `downloadNcbiGff.sh`** (genark + ucsc). Different
   downloaders (`wget -N` vs `datasets download`) but now-identical re-download
   gate (`FETCH_UPDATES` / file-existence). They will drift. Minimum: a
   cross-reference comment; better: extract the gate decision into `common.sh`.
   (The three-way scope-file duplication *within* genark is gone — see
   `list_scoped_gz` in `genark2jbrowse/common.sh` — but these two are untouched.)

7. **Error swallowing conflates outcomes.** `git commit … || echo "No changes"`
   (run.sh lines ~153 and ~209) reports _any_ commit failure as "nothing to
   commit"; `parallel … || true` in the genark chain PIFs hides persistent
   failures. Fix: check `git diff --cached --quiet` before committing so only
   the genuine empty case is silenced.

## Gotcha found along the way (worth its own fix)

On the dev machine, `git add` **refuses to re-stage the two pre-existing
modified `genark2jbrowse/speciesDescriptions/Dengue-virus-type-{3,4}.json`
files** — even `git add .` / after `touch`. No `.gitattributes`, no clean
filter, no gitignore match, no fsmonitor, `ls-files -v` shows normal `H`. It's a
stale index-stat state on a large (~38 MB) index. `git diff` sees the change;
`git add` no-ops. Consequence: those files aren't actually being committed today
regardless of the `git add` scoping. A `git update-index --really-refresh` (or
`git add --renormalize .`) should clear it. Not addressed in this commit.

## Files touched

- `run.sh` — items 1, 2, 3, 4 (help text)
- `common.sh` — item 4 (control-plane doc block)
- `DEVELOPERS.md` — "Do everything" section: flags + env vars
