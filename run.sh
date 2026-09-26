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
  # With no build flags this is an incremental build: genark processes only
  # new/changed hubs; ucsc only assemblies whose trackDb hash changed. Existing
  # hubs would regenerate byte-identical from cached inputs, so reprocessing
  # them is wasted work -- use --reprocess-all to re-apply converter changes.
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

# The pangenome graph configs, which no deploy path used to publish at all.
#
# That omission had a cost: `bovine-arsucd12.json` was committed on 2026-09-09,
# passed every gate, was written up as live, and 404'd in the bucket for a day,
# because `website/pangenome-config/upload.sh` is a hand step and nothing
# reminded anyone of it. `hprc-grch38.json` was live and stale at the same
# moment, still naming the trackId a rename had replaced, so every
# whole-chromosome graph launch on staging named a track the visitor's own
# config did not have. `check-pangenome-assets` reports both now; this is the
# other half, which is that a run publishes them rather than hoping.
#
# It runs on the STAGING path too, unlike every other upload here. Staging
# skips S3 because the data is shared with production -- but these configs are
# exactly what a staging launch fetches, from that same shared bucket, so
# "skip the upload" would leave staging linking a file that does not exist.
# Publishing one to production is inert while `features.pangenome` is closed
# there.
#
# `upload_if_changed` inside it makes this a no-op on a run that changed
# nothing: it compares byte-for-byte against a stamp and neither uploads nor
# invalidates when they match.
# Its own function rather than a block inside gate_configs, because the staging
# path publishes these too and gates nothing else: the rest of gate_configs is
# about the UCSC and GenArk data that a staging run does not upload, and running
# it there would block a website deploy on a finding about files it is not
# touching.
#
# --allow-unpublished because both callers run this immediately BEFORE
# publishing, so a config that is out of date in the bucket is the state this
# run exists to fix rather than a finding. A hand run gets no such promise and
# fails on it, which is how the 404 was found.
gate_pangenome_configs() {
  if [ -n "${SKIP_CONFIG_GATE:-}" ]; then
    echo "SKIP_CONFIG_GATE set; skipping the pangenome config gate."
    return 0
  fi
  echo "Pre-upload gate: checking the pangenome graph configs..."
  pangenome_rc=0
  node scripts/checkPangenomeAssets.mjs --allow-unpublished || pangenome_rc=$?
  if [ "$pangenome_rc" -eq 2 ]; then
    echo "Gate failed to run: checkPangenomeAssets found no configs to check, so"
    echo "it checked nothing. Pass --dir, or re-run with SKIP_CONFIG_GATE=1 to"
    echo "upload unchecked."
    return 1
  elif [ "$pangenome_rc" -ne 0 ]; then
    echo "Gate failed: a pangenome config names a url that does not resolve, or"
    echo "mixes two dataset versions. Re-run with SKIP_CONFIG_GATE=1 if you"
    echo "accept publishing it."
    return 1
  fi
}

publish_pangenome_configs() {
  log "Publishing pangenome graph configs..."
  ./website/pangenome-config/upload.sh
}

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
    echo "For a configs/ file, delete it and its configs-minimal/ twin. For a"
    echo "\$UCSC_BUILT_DIR/<db>/ directory, delete the directory -- that is what"
    echo "makes the next uploadAll.sh sync drop /ucsc/<db>/ from the bucket."
    echo "Re-run with SKIP_CONFIG_GATE=1 if you accept publishing it."
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
  # The pangenome graph configs are the one set here that names data another
  # repo publishes, so a push over there can strand them with nothing on this
  # side reporting it. Exit 2 is "could not run" (no config dir), exit 1 is an
  # unreachable url or a config mixing two dataset versions; a newer upstream
  # version merely prints, since that must not block an unrelated deploy.
  gate_pangenome_configs || return 1
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

# A staging build links every launch at config-staging.json, and neither site
# serves configs -- jbrowse-web resolves ?config= against its own origin, so
# they come from the jbrowse.org bucket. Deploy staging before that file is
# uploaded and every staging launch 404s its config. Cheap to just check.
staging_config_present() {
  staging_config="https://jbrowse.org/ucsc/hg38/config-staging.json"
  if [ "$(curl -s -o /dev/null -w '%{http_code}' -L "$staging_config")" != "200" ]; then
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
    # production is already live, so a missing config-staging.json skips
    # staging with a warning rather than failing the run.
    if staging_config_present; then
      log "Deploying website to staging..."
      pnpm --filter website2 run deploy:staging
      STAGING_DEPLOYED=yes
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
