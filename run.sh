#!/bin/bash
#
# run.sh
#
# Main entry point for the jb2hubs pipeline.
#
# Usage:
#   ./run.sh                # Full pipeline: build + upload + deploy (default).
#                           # Incremental: only new/changed assemblies rebuilt.
#   ./run.sh --dry-run      # Build only, no upload or deploy
#   ./run.sh --upload-only  # Upload + deploy only, skip build (run after --dry-run)
#   ./run.sh --all          # Build every assembly/hub, not just new/changed ones
#   ./run.sh --reprocess-all # Reprocess genark2jbrowse + ucsc2jbrowse from
#                           # cached downloads (re-derives all configs; does not
#                           # re-pull NCBI GFFs unless FETCH_UPDATES=1)
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
  (default)        Full pipeline: build + upload + deploy. Builds are
                   incremental: only new/changed assemblies are reprocessed.
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
  ./genark2jbrowse/make.sh --explain
  ./ucsc2jbrowse/make.sh --explain
  echo "This covers the build only. Whether run.sh then uploads, deploys the"
  echo "website or invalidates CloudFront depends on what the build changes,"
  echo "which is not knowable until it runs."
  exit 0
fi

# Flags to forward to both make.sh scripts, which accept the same vocabulary.
BUILD_FLAGS=()
if [ -n "${REPROCESS:-}" ]; then
  BUILD_FLAGS+=(--reprocess-all)
elif [ "$PROCESS_ALL" = true ]; then
  BUILD_FLAGS+=(--all)
fi

# --- Setup logging ---

mkdir -p logs
LOG_FILE="logs/run_$(date +%Y-%m-%d_%H-%M-%S).log"
echo "Logging to $LOG_FILE"

exec > >(tee -a "$LOG_FILE") 2>&1

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
  # With no build flags this is an incremental build: genark processes only
  # new/changed hubs; ucsc only assemblies whose trackDb hash changed. Existing
  # hubs would regenerate byte-identical from cached inputs, so reprocessing
  # them is wasted work -- use --reprocess-all to re-apply converter changes.
  build_description="${BUILD_FLAGS[*]:-incremental}"

  echo "Running genark2jbrowse/make.sh ($build_description)..."
  ./genark2jbrowse/make.sh ${BUILD_FLAGS[@]+"${BUILD_FLAGS[@]}"}

  echo "Running ucsc2jbrowse/make.sh ($build_description)..."
  ./ucsc2jbrowse/make.sh ${BUILD_FLAGS[@]+"${BUILD_FLAGS[@]}"}

  echo "Extracting SyntenyTrack datasets..."
  node scripts/extractSyntenyTracks.ts

  echo "Formatting codebase..."
  pnpm run format

  echo "Build phase complete"
else
  echo "Skipping build phase (--upload-only)"
fi

# --- Phase 2: Deploy ---

# Refuse to publish configs that cannot boot. Regenerating rewrites every
# config's plugins[] from hubtools' defaultPlugins, so one bad plugin url turns
# all ~50900 configs into error pages at once -- and those urls are published
# from another repo, so the working tree can look untouched while what it names
# has already broken. --local feeds these exact files to real hosted releases
# before they become public.
#
# Escape hatch on purpose: a gate that cannot be bypassed gets deleted the first
# time it is wrong during an urgent ship. SKIP_CONFIG_GATE=1 to override.
gate_configs() {
  if [ -n "${SKIP_CONFIG_GATE:-}" ]; then
    echo "SKIP_CONFIG_GATE set; skipping the pre-upload config gate."
    return 0
  fi
  # Which files are published at all, before anything asks what is in them.
  # configs/ is an append-only mirror, so a db that disappears upstream leaves
  # its config behind forever, still merged into all.json and still served.
  # make.sh prunes what it can prove is junk; a real config for a db UCSC no
  # longer lists is a retirement decision, so it stops here for a human.
  echo "Pre-upload gate: checking for orphaned UCSC configs..."
  orphan_rc=0
  node scripts/checkOrphanConfigs.mjs || orphan_rc=$?
  if [ "$orphan_rc" -eq 2 ]; then
    echo "Gate failed to run: checkOrphanConfigs found no genome list or no"
    echo "configs to compare against, so it checked nothing. Pass --list or set"
    echo "UCSC_BUILT_DIR, or re-run with SKIP_CONFIG_GATE=1 to upload unchecked."
    return 1
  elif [ "$orphan_rc" -ne 0 ]; then
    echo "Gate failed: a config names a db the UCSC genome list does not have."
    echo "Delete it and its configs-minimal/ twin if the db really disappeared"
    echo "upstream. Re-run with SKIP_CONFIG_GATE=1 if you accept publishing it."
    return 1
  fi
  echo "Pre-upload gate: checking every plugin url the configs name..."
  if ! node scripts/checkPluginUrls.mjs; then
    echo "Gate failed: a plugin url is broken. Uploading would error-page every"
    echo "config that names it. Fix the url (or the plugin publish) first, or"
    echo "re-run with SKIP_CONFIG_GATE=1 if you accept that."
    return 1
  fi
  # The other field that fails a whole session rather than one track: loadPre()
  # fetches the sidecars in one Promise.all, so a dead chromAlias url is "this
  # assembly does not open". Cheap -- once mirrored these are all local, so it
  # is an on-disk existence check. Not in lint.yml: it needs the built dir.
  echo "Pre-upload gate: checking every assembly sidecar the configs name..."
  if ! node scripts/checkSidecarUrls.mjs; then
    echo "Gate failed: a config names a sidecar that does not resolve. Each one"
    echo "fails its whole assembly, not just that file. Re-run with"
    echo "SKIP_CONFIG_GATE=1 if you accept that."
    return 1
  fi
  # Track data files, the other several thousand references. Only the relative
  # ones -- those name our own bucket, so this is an on-disk existence check with
  # no network at all, and it catches a config about to name a file we are not
  # uploading. Hunting upstream 404s is the daily track-url canary's job: that
  # question moves on upstream's timetable, not ours, and a blocking gate is the
  # wrong place to spend hgdownload's patience.
  echo "Pre-upload gate: checking every relative track file the configs name..."
  # Exit 2 is "the check could not run" (no built tree to resolve relative refs
  # against), not "a ref is broken". Both still block -- a gate that cannot run
  # has verified nothing -- but reporting the first as the second sends the
  # reader looking for a bad config that does not exist.
  track_url_rc=0
  node scripts/checkTrackUrls.mjs --offline || track_url_rc=$?
  if [ "$track_url_rc" -eq 2 ]; then
    echo "Gate failed to run: checkTrackUrls could not find the built tree, so it"
    echo "checked nothing. Set UCSC_BUILT_DIR or pass --built-dir, or re-run with"
    echo "SKIP_CONFIG_GATE=1 to upload unchecked."
    return 1
  elif [ "$track_url_rc" -ne 0 ]; then
    echo "Gate failed: a config names a track file that is not in the built tree."
    echo "That track would 404 from our own bucket. Re-run with"
    echo "SKIP_CONFIG_GATE=1 if you accept that."
    return 1
  fi
  # Whether the files themselves are complete, which is a different question
  # from whether a config names them: a bgzipped track with no .csi is not a
  # missing reference, it is a present reference to an unusable file. Local
  # walk, no network, so GenArk is in scope here even though it is out of scope
  # for the two url checks above.
  echo "Pre-upload gate: checking every derived track file has a tabix index..."
  tabix_rc=0
  node scripts/checkTabixIndexes.mjs || tabix_rc=$?
  if [ "$tabix_rc" -eq 2 ]; then
    echo "Gate failed to run: checkTabixIndexes found no built tree to walk, so"
    echo "it checked nothing. Set UCSC_BUILT_DIR or pass --dir, or re-run with"
    echo "SKIP_CONFIG_GATE=1 to upload unchecked."
    return 1
  elif [ "$tabix_rc" -ne 0 ]; then
    echo "Gate failed: a derived track file has no tabix index beside it. The"
    echo "track is unopenable, and the derivation left no rebuild stamp, so no"
    echo "later run retries it. Re-run with SKIP_CONFIG_GATE=1 if you accept that."
    return 1
  fi
  echo "Pre-upload gate: booting working-tree configs on hosted releases..."
  if ! node scripts/checkConfigCompat.mjs --local; then
    echo "Gate failed: a working-tree config does not boot on a hosted JBrowse"
    echo "release. These configs live at permanent urls that old desktop installs"
    echo "and published links keep naming, so this would break them. Re-run with"
    echo "SKIP_CONFIG_GATE=1 if you accept that."
    return 1
  fi
  echo "Pre-upload gate passed."
}

if [ "$DRY_RUN" = false ] && [ "$STAGING" = true ]; then
  # Staging deploys only the website. Data is shared with production (the site
  # references jbrowse.org S3 via absolute URLs), so there is no S3 upload, and
  # staging must not commit/push to main. The website is built with
  # --mode staging (PUBLIC_STAGING=true) which enables in-progress pages.
  echo "Staging mode: skipping S3 data upload and git commit/push."
  # A staging build links every launch at config-staging.json, and neither site
  # serves configs -- jbrowse-web resolves ?config= against its own origin, so
  # they come from the jbrowse.org bucket. Deploy staging before that file is
  # uploaded and every staging launch 404s its config. Cheap to just check.
  staging_config="https://jbrowse.org/ucsc/hg38/config-staging.json"
  if [ "$(curl -s -o /dev/null -w '%{http_code}' -L "$staging_config")" != "200" ]; then
    echo "Error: $staging_config is not in the bucket."
    echo "Run ./ucsc2jbrowse/make.sh (which writes it) and upload before deploying staging,"
    echo "or every staging launch fails to fetch its config."
    exit 1
  fi
  echo "Deploying website to staging..."
  pnpm --filter website2 run deploy:staging
  echo "Staging deploy complete"
elif [ "$DRY_RUN" = false ]; then
  gate_configs

  echo "Uploading genark data..."
  ./genark2jbrowse/uploadAll.sh

  echo "Uploading ucsc data..."
  ./ucsc2jbrowse/uploadAll.sh

  echo "Committing hub changes before generating recently updated..."
  git add hubs/
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
  if git diff --cached --quiet -- hubs/; then
    echo "No hub changes to commit"
  else
    git commit -m "Update hubs" -- hubs/
  fi

  # Decide whether the website needs rebuilding/redeploying. The site is a
  # function of: genark data (uploaded above), ucsc data (uploaded above), and
  # the website source + list.json (tracked under website/). If none of those
  # changed, the built site would be byte-identical, so skip the expensive
  # astro build + 4.7GB ship + CloudFront /* invalidation.
  GENARK_CHANGED=$(cat genark2jbrowse/.upload-changed 2>/dev/null || echo 1)
  UCSC_CHANGED=$(cat ucsc2jbrowse/.upload-changed 2>/dev/null || echo 1)
  WEBSITE_DIRTY=0
  [ -n "$(git status --porcelain website/)" ] && WEBSITE_DIRTY=1

  # Persist a "deploy pending" marker the moment data is uploaded to S3, and
  # only clear it after a successful website deploy. This guarantees that if a
  # run uploads to S3 but then crashes before/during the deploy, the next run
  # still deploys (instead of seeing "nothing changed" and leaving the site
  # permanently stale relative to S3).
  DEPLOY_STAMP=".deploy-pending"
  if [ "$GENARK_CHANGED" = 1 ] || [ "$UCSC_CHANGED" = 1 ] || [ "$WEBSITE_DIRTY" = 1 ]; then
    touch "$DEPLOY_STAMP"
  fi

  if [ -f "$DEPLOY_STAMP" ]; then
    echo "Changes detected (genark=$GENARK_CHANGED ucsc=$UCSC_CHANGED website=$WEBSITE_DIRTY) or prior deploy incomplete; running website deploy..."
    pnpm --filter website2 run deploy
    rm -f "$DEPLOY_STAMP"
    WEBSITE_DEPLOYED=yes
  else
    echo "No genark/ucsc/website changes detected; skipping website build, deploy, and CloudFront invalidation."
    WEBSITE_DEPLOYED=no
  fi

  # One-line summary so it's easy to confirm from logs that incremental
  # detection is doing its job (e.g. a quiet run should read "all unchanged").
  describe() { [ "$1" = 1 ] && echo "changed" || echo "unchanged"; }
  echo "=== RUN SUMMARY === genark data: $(describe "$GENARK_CHANGED") | ucsc data: $(describe "$UCSC_CHANGED") | website source: $(describe "$WEBSITE_DIRTY") | website deployed: $WEBSITE_DEPLOYED"

  # Scope the commit to pipeline-generated paths so stray edits in the working
  # tree don't ride along to origin. hubs/ was committed above.
  git add -A -- \
    genark2jbrowse/hubs genark2jbrowse/taxon_images \
    genark2jbrowse/processedHubJson genark2jbrowse/speciesDescriptions \
    ucsc2jbrowse/configs ucsc2jbrowse/configs-minimal \
    ucsc2jbrowse/fileAccessCache ucsc2jbrowse/removedTracks \
    ucsc2jbrowse/blockedFiles.json ucsc2jbrowse/removedTracks.json \
    ucsc2jbrowse/fileListing.txt 'website/src/*.json'
  # Same reasoning as the hubs commit above: an empty index is fine, a failed
  # commit is not, and this is the last chance to notice before `git push`.
  if git diff --cached --quiet; then
    echo "No additional changes to commit"
  else
    git commit -m "Updates"
  fi
  git push

  echo "Deploy phase complete"
fi

echo "Done!"
echo "Log saved to $LOG_FILE"
