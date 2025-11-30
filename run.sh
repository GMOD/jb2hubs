#!/bin/bash
set -e
export NODE_OPTIONS="--experimental-strip-types"

SCRIPT_DIR="$(dirname "$0")"

mkdir -p "$SCRIPT_DIR/logs"
LOG_FILE="$SCRIPT_DIR/logs/run_$(date +%Y-%m-%d_%H-%M-%S).log"
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

echo "Running genark2jbrowse/makeAll.sh..."
"$SCRIPT_DIR/genark2jbrowse/makeAll.sh"
"$SCRIPT_DIR/genark2jbrowse/uploadAll.sh"

echo "Running ucsc2jbrowse/doAll.sh..."
"$SCRIPT_DIR/ucsc2jbrowse/doAll.sh"
"$SCRIPT_DIR/ucsc2jbrowse/uploadAll.sh"

echo "Extracting SyntenyTrack datasets..."
node "$SCRIPT_DIR/extractSyntenyTracks.ts"

echo "Running website deploy..."
yarn --cwd "$SCRIPT_DIR/website" deploy

git add .
git commit -m "Updates"
git push

echo "Log saved to $LOG_FILE"
