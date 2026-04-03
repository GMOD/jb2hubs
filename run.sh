#!/bin/bash
#
# run.sh
#
# Main entry point for the jb2hubs pipeline.
#
# Usage:
#   ./run.sh              # Full pipeline: build + upload + deploy (default)
#   ./run.sh --dry-run    # Build only, no upload or deploy
#   ./run.sh --upload-only # Upload + deploy only, skip build (run after --dry-run)
#   ./run.sh --new-only   # Only process new genark hubs (faster builds)
#

set -e
export NODE_OPTIONS="--experimental-strip-types"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Parse arguments
DRY_RUN=false
UPLOAD_ONLY=false
NEW_ONLY=false
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --upload-only)
      UPLOAD_ONLY=true
      shift
      ;;
    --new-only)
      NEW_ONLY=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  (default)       Full pipeline: build + upload + deploy"
      echo "  --dry-run       Build only, no upload or deploy"
      echo "  --upload-only   Upload + deploy only, skip build (run after --dry-run)"
      echo "  --new-only      Only process new genark hubs (faster builds)"
      echo "  --help, -h      Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Validate options
if [ "$DRY_RUN" = true ] && [ "$UPLOAD_ONLY" = true ]; then
  echo "Error: --dry-run and --upload-only cannot be used together"
  exit 1
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
  if [ "$NEW_ONLY" = true ]; then
    echo "Running genark2jbrowse/make.sh (new only)..."
    ./genark2jbrowse/make.sh
  else
    echo "Running genark2jbrowse/make.sh --all..."
    ./genark2jbrowse/make.sh --all
  fi

  echo "Running ucsc2jbrowse/make.sh..."
  ./ucsc2jbrowse/make.sh

  echo "Extracting SyntenyTrack datasets..."
  node extractSyntenyTracks.ts

  echo "Formatting codebase..."
  yarn format

  echo "Build phase complete"
else
  echo "Skipping build phase (--upload-only)"
fi

# --- Phase 2: Deploy ---

if [ "$DRY_RUN" = false ]; then
  echo "Uploading genark data..."
  ./genark2jbrowse/uploadAll.sh

  echo "Uploading ucsc data..."
  ./ucsc2jbrowse/uploadAll.sh

  echo "Committing hub changes before generating recently updated..."
  git add hubs/
  git commit -m "Update hubs" || echo "No hub changes to commit"

  echo "Running website deploy..."
  yarn --cwd website deploy

  echo "Invalidating CloudFront cache..."
  yarn --cwd website invalidate-all

  git add .
  git commit -m "Updates" || echo "No additional changes to commit"
  git push

  echo "Deploy phase complete"
fi

echo "Done!"
echo "Log saved to $LOG_FILE"
