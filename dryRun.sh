#!/bin/bash
set -e
export NODE_OPTIONS="--experimental-strip-types"

SCRIPT_DIR="$(dirname "$0")"
cd "$SCRIPT_DIR"

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

echo "Running genark2jbrowse/makeAll.sh..."
./genark2jbrowse/makeAll.sh

echo "Running ucsc2jbrowse/doAll.sh..."
./ucsc2jbrowse/doAll.sh

echo "Extracting SyntenyTrack datasets..."
node extractSyntenyTracks.ts

echo "Formatting codebase..."
yarn format

echo "Dry run complete - no files uploaded"
echo "Log saved to $LOG_FILE"
