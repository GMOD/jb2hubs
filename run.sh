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
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

# Parse arguments. --all, --reprocess-all and --help are handled by parse_flags.
DRY_RUN=false
UPLOAD_ONLY=false
STAGING=false
PROCESS_ALL=false
USAGE="Usage: $0 [OPTIONS]

Options:
  (default)        Full pipeline: build + upload + deploy. Builds are
                   incremental: only new/changed assemblies are reprocessed.
  --dry-run        Build only, no upload or deploy
  --upload-only    Upload + deploy only, skip build (run after --dry-run)
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
  node extractSyntenyTracks.ts

  echo "Formatting codebase..."
  pnpm run format

  echo "Build phase complete"
else
  echo "Skipping build phase (--upload-only)"
fi

# --- Phase 2: Deploy ---

if [ "$DRY_RUN" = false ] && [ "$STAGING" = true ]; then
  # Staging deploys only the website. Data is shared with production (the site
  # references jbrowse.org S3 via absolute URLs), so there is no S3 upload, and
  # staging must not commit/push to main. The website is built with
  # --mode staging (PUBLIC_STAGING=true) which enables in-progress pages.
  echo "Staging mode: skipping S3 data upload and git commit/push."
  echo "Deploying website to staging..."
  pnpm --filter website2 run deploy:staging
  echo "Staging deploy complete"
elif [ "$DRY_RUN" = false ]; then
  echo "Uploading genark data..."
  ./genark2jbrowse/uploadAll.sh

  echo "Uploading ucsc data..."
  ./ucsc2jbrowse/uploadAll.sh

  echo "Committing hub changes before generating recently updated..."
  git add hubs/
  git commit -m "Update hubs" || echo "No hub changes to commit"

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
    ucsc2jbrowse/blockedFiles ucsc2jbrowse/removedTracks \
    ucsc2jbrowse/blockedFiles.json ucsc2jbrowse/removedTracks.json \
    ucsc2jbrowse/fileListing.txt website/src/*.json
  git commit -m "Updates" || echo "No additional changes to commit"
  git push

  echo "Deploy phase complete"
fi

echo "Done!"
echo "Log saved to $LOG_FILE"
