#!/bin/bash
#
# run.sh
#
# Main entry point for the jb2hubs pipeline.
#
# Usage:
#   ./run.sh                # Full pipeline: build + upload + deploy prod & staging.
#                           # Incremental: only new/changed assemblies rebuilt.
#   ./run.sh --dry-run      # Build only, no upload or deploy
#   ./run.sh --upload-only  # Upload + deploy only, skip build (run after --dry-run)
#   ./run.sh --all          # Build every assembly/hub, not just new/changed ones
#   ./run.sh --reprocess-all # Re-derive every PIF, GFF index and genetic code
#                           # from cached downloads, then rebuild all configs.
#                           # Hours; a converter change alone does not need it.
#                           # Does not re-pull NCBI GFFs unless FETCH_UPDATES=1.
#   ./run.sh --staging      # Build + deploy website to staging only. Skips S3
#                           # data upload and git commit/push; staging reads the
#                           # same production S3 data via absolute URLs.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/common.sh"
cd "$SCRIPT_DIR"

# Parse arguments. --all, --reprocess-all and --help are handled by parse_flags.
DRY_RUN=false
UPLOAD_ONLY=false
STAGING=false
PROCESS_ALL=false
EXPLAIN=false
USAGE="Usage: $0 [OPTIONS]

Options:
  (default)        Full pipeline: build + upload + deploy, to both production
                   and staging. Builds are incremental: only new/changed
                   assemblies are reprocessed.
  --dry-run        Build only, no upload or deploy
  --upload-only    Upload + deploy only, skip build (run after --dry-run)
  --explain        Report what both pipelines would rebuild, then exit. Note
                   this covers the BUILD only -- see below.
  --staging        Build, then deploy the website to staging only. Skips S3
                   data upload and git commit/push; the staging site reads the
                   same production S3 data.

To rebuild one pipeline only, run its make.sh directly and then ship:
  ./ucsc2jbrowse/make.sh && ./run.sh --upload-only"
handle_flag() {
  case "$1" in
  --dry-run) DRY_RUN=true ;;
  --upload-only) UPLOAD_ONLY=true ;;
  --staging) STAGING=true ;;
  *) return 1 ;;
  esac
}
parse_flags "$@"

# Validate options
if [ "$DRY_RUN" = true ] && [ "$UPLOAD_ONLY" = true ]; then
  echo "Error: --dry-run and --upload-only cannot be used together"
  exit 1
fi

if [ "$STAGING" = true ] && [ "$DRY_RUN" = true ]; then
  echo "Error: --staging deploys the website, so it cannot be used with --dry-run"
  exit 1
fi

# --upload-only skips the build, so a flag that only shapes the build would
# silently do nothing.
if [ "$UPLOAD_ONLY" = true ] && [ "$PROCESS_ALL" = true ]; then
  echo "Error: --upload-only skips the build, so it cannot be combined with --all or --reprocess-all"
  exit 1
fi

# Flags to forward to both make.sh scripts, which accept the same vocabulary.
BUILD_FLAGS=()
if [ -n "${REPROCESS:-}" ]; then
  BUILD_FLAGS+=(--reprocess-all)
elif [ "$PROCESS_ALL" = true ]; then
  BUILD_FLAGS+=(--all)
fi

# --explain is forwarded rather than reimplemented: the question is entirely
# about what the two make.sh runs would rebuild, and each already answers it
# against its own gates. Handled before every other mode check, because it must
# not be combinable with anything that uploads or deploys -- and it exits here,
# so it cannot be.
#
# It deliberately does NOT describe run.sh's own decisions (the pre-upload
# gates, whether the website is rebuilt, what gets invalidated). Those are
# downstream of a build that has not happened, so predicting them would mean
# guessing. Say what is known.
if [ "$EXPLAIN" = true ]; then
  ./genark2jbrowse/make.sh --explain ${BUILD_FLAGS[@]+"${BUILD_FLAGS[@]}"}
  ./ucsc2jbrowse/make.sh --explain ${BUILD_FLAGS[@]+"${BUILD_FLAGS[@]}"}
  echo "This covers the build only. Whether run.sh then uploads, deploys the"
  echo "website or invalidates CloudFront depends on what the build changes,"
  echo "which is not knowable until it runs."
  exit 0
fi

# --- Setup logging ---

mkdir -p logs
# A full run's log is ~50MB and nothing ever pruned them (1.6GB by 2026-09-01).
find logs -name 'run_*.log' -mtime +30 -delete
LOG_FILE="logs/run_$(date +%Y-%m-%d_%H-%M-%S).log"
echo "Logging to $LOG_FILE"

exec > >(tee -a "$LOG_FILE") 2>&1

# stdout is the tee pipe from here on, not the terminal it was when this script
# sourced lib/common.sh -- so anything decided from `[ -t 1 ]` back then is now
# wrong and exported. See set_parallel_opts for what that would cost.
set_parallel_opts

cleanup() {
  exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo "Script terminated with exit code $exit_code at $(date)"
  fi
}
trap cleanup EXIT
trap 'echo "Script interrupted by SIGINT (Ctrl+C) at $(date)"; exit 130' INT
trap 'echo "Script terminated by SIGTERM at $(date)"; exit 143' TERM

# --- Phase 1: Build ---

if [ "$UPLOAD_ONLY" = false ]; then
  # With no build flags this is an incremental build. genark rebuilds every
  # config and writes the ones whose content changed, so a converter change
  # lands without a flag. ucsc rebuilds assemblies whose trackDb hash or
  # converter-source hash changed. --reprocess-all is for when the derived
  # files themselves (PIFs, GFF indexes, codes) must be re-derived.
  build_description="${BUILD_FLAGS[*]:-incremental}"

  log "Running genark2jbrowse/make.sh ($build_description)..."
  ./genark2jbrowse/make.sh ${BUILD_FLAGS[@]+"${BUILD_FLAGS[@]}"}

  log "Running ucsc2jbrowse/make.sh ($build_description)..."
  ./ucsc2jbrowse/make.sh ${BUILD_FLAGS[@]+"${BUILD_FLAGS[@]}"}

  log "Extracting SyntenyTrack datasets..."
  node scripts/extractSyntenyTracks.ts

  log "Formatting codebase..."
  pnpm run format

  log "Build phase complete"
else
  echo "Skipping build phase (--upload-only)"
fi

# --- Phase 2: Deploy ---

# Runs one pre-upload check. Exit 2 means the check could not run (nothing to
# check against), which blocks too but needs a different fix than a finding.
# Usage: run_gate <what> <could-not-run hint, or ""> <failure> <cmd...>
run_gate() {
  local what="$1" cannot_run="$2" failure="$3" rc=0
  shift 3
  echo "Pre-upload gate: checking $what..."
  "$@" || rc=$?
  if [ "$rc" -eq 0 ]; then
    return 0
  fi
  if [ "$rc" -eq 2 ] && [ -n "$cannot_run" ]; then
    echo "Gate failed to run, so it checked nothing: $cannot_run Re-run with"
    echo "SKIP_CONFIG_GATE=1 to upload unchecked."
  else
    echo "Gate failed: $failure Re-run with SKIP_CONFIG_GATE=1 if you accept that."
  fi
  return 1
}

# Separate from gate_configs because the staging path publishes these and
# uploads nothing else. --allow-unpublished because both callers publish right
# after, so a stale config in the bucket is what the run is about to fix.
gate_pangenome_configs() {
  if [ -n "${SKIP_CONFIG_GATE:-}" ]; then
    echo "SKIP_CONFIG_GATE set; skipping the pangenome config gate."
    return 0
  fi
  run_gate "the pangenome graph configs" \
    "checkPangenomeAssets found no configs. Pass --dir." \
    "a pangenome config names a url that does not resolve, or mixes two dataset versions." \
    node scripts/checkPangenomeAssets.mjs --allow-unpublished
}

# Staging publishes these too: a staging launch fetches them from the shared
# bucket. upload_if_changed makes it a no-op when nothing changed.
publish_pangenome_configs() {
  log "Publishing pangenome graph configs..."
  ./website/pangenome-config/upload.sh
}

# Refuses to publish configs that cannot boot: one bad plugin url error-pages
# every config, and plugins publish from another repo. SKIP_CONFIG_GATE=1
# overrides, because a gate that cannot be bypassed gets deleted in an urgent ship.
gate_configs() {
  if [ -n "${SKIP_CONFIG_GATE:-}" ]; then
    echo "SKIP_CONFIG_GATE set; skipping the pre-upload config gate."
    return 0
  fi
  run_gate "for orphaned UCSC configs" \
    "checkOrphanConfigs found no genome list or no configs. Pass --list or set UCSC_BUILT_DIR." \
    "a config names a db the UCSC genome list does not have. For a configs/ file, delete it and its configs-minimal/ twin; for a \$UCSC_BUILT_DIR/<db>/ directory, delete the directory, so the next uploadAll.sh drops /ucsc/<db>/ from the bucket." \
    node scripts/checkOrphanConfigs.mjs || return 1
  run_gate "every plugin url the configs name" "" \
    "a plugin url is broken, and uploading would error-page every config that names it." \
    node scripts/checkPluginUrls.mjs || return 1
  run_gate "every assembly sidecar the configs name" "" \
    "a config names a sidecar that does not resolve, which fails its whole assembly." \
    node scripts/checkSidecarUrls.mjs || return 1
  run_gate "every relative track file the configs name" \
    "checkTrackUrls could not find the built tree. Set UCSC_BUILT_DIR or pass --built-dir." \
    "a config names a track file that is not in the built tree, so it would 404 from our own bucket." \
    node scripts/checkTrackUrls.mjs --offline || return 1
  run_gate "every derived track file has a tabix index and records" \
    "checkTabixIndexes found no built tree. Set UCSC_BUILT_DIR or pass --dir." \
    "a derived track file has no tabix index, or no records while its source table has rows, and no later run rebuilds it on its own." \
    node scripts/checkTabixIndexes.mjs || return 1
  gate_pangenome_configs || return 1
  run_gate "that working-tree configs boot on hosted releases" "" \
    "a working-tree config does not boot on a hosted JBrowse release, which would break the old Desktop installs and links that name its url." \
    node scripts/checkConfigCompat.mjs --local || return 1
  echo "Pre-upload gate passed."
}

# A staging build links every launch at config-staging.json, and neither site
# serves configs -- jbrowse-web resolves ?config= against its own origin, so
# they come from the jbrowse.org bucket. Deploy staging before that file is
# uploaded and every staging launch 404s its config. Cheap to just check.
staging_config_present() {
  staging_config="https://jbrowse.org/ucsc/hg38/config-staging.json"
  if [ "$(curl -s --max-time 60 -o /dev/null -w '%{http_code}' -L "$staging_config")" != "200" ]; then
    echo "Error: $staging_config is not in the bucket."
    echo "Run ./ucsc2jbrowse/make.sh (which writes it) and upload before deploying staging,"
    echo "or every staging launch fails to fetch its config."
    return 1
  fi
}

if [ "$DRY_RUN" = false ] && [ "$STAGING" = true ]; then
  # Staging deploys only the website. Data is shared with production (the site
  # references jbrowse.org S3 via absolute URLs), so there is no S3 upload, and
  # staging must not commit/push to main. The website is built with
  # --mode staging (PUBLIC_STAGING=true) which enables in-progress pages.
  echo "Staging mode: skipping S3 data upload and git commit/push."
  staging_config_present || exit 1
  gate_pangenome_configs || exit 1
  publish_pangenome_configs
  log "Deploying website to staging..."
  pnpm --filter website2 run deploy:staging
  echo "Staging deploy complete"
elif [ "$DRY_RUN" = false ]; then
  gate_configs

  log "Uploading genark data..."
  ./genark2jbrowse/uploadAll.sh

  log "Uploading ucsc data..."
  ./ucsc2jbrowse/uploadAll.sh

  publish_pangenome_configs

  # hubs/ and hubFirstSeen.json are one change: the file records the run that
  # first built each config, and the website reads it, not the git history.
  echo "Committing hub changes..."
  hub_paths=(hubs/ genark2jbrowse/hubFirstSeen.json)
  git add "${hub_paths[@]}"
  # Silence only the genuinely-empty case. `git commit || echo "no changes"`
  # reports a hook, lock or index failure as "nothing to commit", so a run that
  # uploads to S3 and then fails to record what it generated looks like a quiet
  # success. An empty index is the one outcome that is not an error, and it is
  # exactly what `git diff --cached --quiet` detects; anything else exits
  # non-zero under `set -e` and stops the deploy.
  # Scoped to hubs/, for the same reason the commit below is scoped: `git
  # commit` takes the whole index, not the paths just added, so anything else
  # already staged in the working tree rides along to origin under "Update
  # hubs". That is not hypothetical -- a staged `git rm` of two pipeline scripts
  # shipped this way on 2026-08-05, leaving make.sh calling a deleted file.
  if git diff --cached --quiet -- "${hub_paths[@]}"; then
    echo "No hub changes to commit"
  else
    git commit -m "Update hubs" -- "${hub_paths[@]}"
  fi

  # Decide whether the website needs rebuilding/redeploying. The site is a
  # function of: genark data (uploaded above), ucsc data (uploaded above), and
  # the website source + list.json (tracked under website/). If none of those
  # changed, the built site would be byte-identical, so skip the expensive
  # astro build + 4.7GB ship + CloudFront /* invalidation.
  #
  # "Changed" for the source means changed since the last deploy, not
  # uncommitted: this checkout pulls code as commits, so a website change that
  # arrives with no data change left `git status` clean and never deployed. The
  # stamp is the tree hash of website/ as it stands on disk, taken through a
  # throwaway index so untracked files count and ignored ones do not. It is the
  # same hash once the "Updates" commit below records the pipeline's own
  # website/src/*.json, and it is written only after a deploy succeeds.
  website_tree() {
    local index status
    index=$(mktemp)
    cp "$(git rev-parse --git-path index)" "$index" &&
      GIT_INDEX_FILE=$index git add -A -- website/ &&
      GIT_INDEX_FILE=$index git write-tree --prefix=website/
    status=$?
    rm -f "$index"
    return $status
  }
  GENARK_CHANGED=$(cat genark2jbrowse/.upload-changed 2>/dev/null || echo 1)
  UCSC_CHANGED=$(cat ucsc2jbrowse/.upload-changed 2>/dev/null || echo 1)
  WEBSITE_STAMP=".website-deployed-tree"
  # A hash that cannot be taken reads as changed: one deploy too many, never one
  # too few.
  WEBSITE_TREE=$(website_tree) || WEBSITE_TREE=
  WEBSITE_CHANGED=0
  [ "$WEBSITE_TREE" != "$(cat "$WEBSITE_STAMP" 2>/dev/null)" ] && WEBSITE_CHANGED=1

  # Persist a "deploy pending" marker the moment data is uploaded to S3, and
  # only clear it after a successful website deploy. This guarantees that if a
  # run uploads to S3 but then crashes before/during the deploy, the next run
  # still deploys (instead of seeing "nothing changed" and leaving the site
  # permanently stale relative to S3).
  DEPLOY_STAMP=".deploy-pending"
  if [ "$GENARK_CHANGED" = 1 ] || [ "$UCSC_CHANGED" = 1 ] || [ "$WEBSITE_CHANGED" = 1 ]; then
    touch "$DEPLOY_STAMP"
  fi

  if [ -f "$DEPLOY_STAMP" ]; then
    echo "Changes detected (genark=$GENARK_CHANGED ucsc=$UCSC_CHANGED website=$WEBSITE_CHANGED) or prior deploy incomplete; running website deploy..."
    pnpm --filter website2 run deploy
    rm -f "$DEPLOY_STAMP"
    [ -n "$WEBSITE_TREE" ] && echo "$WEBSITE_TREE" >"$WEBSITE_STAMP"
    WEBSITE_DEPLOYED=yes

    # Staging serves the same data from the same bucket, so anything that
    # changed production changed it too. Deploying both here is what keeps
    # staging from drifting weeks behind main. It is a separate release
    # directory and symlink, so a failure here leaves production alone -- and
    # production is already live, so a missing config-staging.json or a failed
    # staging deploy is reported rather than failing the run: the summary,
    # commit and push below record what production now serves.
    if staging_config_present; then
      log "Deploying website to staging..."
      if pnpm --filter website2 run deploy:staging; then
        STAGING_DEPLOYED=yes
      else
        echo "WARNING: staging deploy failed; production is unaffected." >&2
        STAGING_DEPLOYED=failed
      fi
    else
      echo "Skipping staging deploy."
      STAGING_DEPLOYED=no
    fi
  else
    echo "No genark/ucsc/website changes detected; skipping website build, deploy, and CloudFront invalidation."
    WEBSITE_DEPLOYED=no
    STAGING_DEPLOYED=no
  fi

  # One-line summary so it's easy to confirm from logs that incremental
  # detection is doing its job (e.g. a quiet run should read "all unchanged").
  describe() { [ "$1" = 1 ] && echo "changed" || echo "unchanged"; }
  log "=== RUN SUMMARY === genark data: $(describe "$GENARK_CHANGED") | ucsc data: $(describe "$UCSC_CHANGED") | website source: $(describe "$WEBSITE_CHANGED") | website deployed: $WEBSITE_DEPLOYED | staging deployed: $STAGING_DEPLOYED"

  # Scoped to pipeline-generated paths, in the add, the check and the commit,
  # for the reason the hubs commit above gives. hubs/ was committed there;
  # genark2jbrowse/hubs is only a symlink to it.
  generated_paths=(
    genark2jbrowse/taxon_images
    genark2jbrowse/processedHubJson genark2jbrowse/speciesDescriptions
    ucsc2jbrowse/configs ucsc2jbrowse/configs-minimal
    ucsc2jbrowse/fileAccessCache ucsc2jbrowse/removedTracks
    ucsc2jbrowse/blockedFiles.json ucsc2jbrowse/removedTracks.json
    'website/src/*.json'
  )
  git add -A -- "${generated_paths[@]}"
  if git diff --cached --quiet -- "${generated_paths[@]}"; then
    echo "No additional changes to commit"
  else
    git commit -m "Updates" -- "${generated_paths[@]}"
  fi
  git push

  echo "Deploy phase complete"
fi

echo "Done!"
echo "Log saved to $LOG_FILE"
