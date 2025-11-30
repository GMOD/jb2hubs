#!/bin/bash
set -e
export NODE_OPTIONS="--experimental-strip-types"
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
(cd genark2jbrowse && ./makeAll.sh && ./uploadAll.sh)

echo "Running ucsc2jbrowse/doAll.sh..."
(cd ucsc2jbrowse && ./doAll.sh && ./uploadAll.sh)

echo "Extracting SyntenyTrack datasets..."
node extractSyntenyTracks.ts

echo "Running website deploy..."
(cd website && yarn deploy)

git add .
git commit -m "Updates"
git push

echo "Log saved to $LOG_FILE"
