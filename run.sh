#!/bin/bash
set -e
export NODE_OPTIONS="--experimental-strip-types"
mkdir -p logs
LOG_FILE="logs/run_$(date +%Y-%m-%d_%H-%M-%S).log"
echo "Logging to $LOG_FILE"

cleanup() {
    exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo "Script terminated with exit code $exit_code at $(date)" | tee -a "$LOG_FILE"
    fi
}
trap cleanup EXIT

trap 'echo "Script interrupted by SIGINT (Ctrl+C) at $(date)" | tee -a "$LOG_FILE"; exit 130' INT
trap 'echo "Script terminated by SIGTERM at $(date)" | tee -a "$LOG_FILE"; exit 143' TERM

# Run genark2jbrowse/makeAll.sh
echo "Running genark2jbrowse/makeAll.sh..." | tee -a "$LOG_FILE"
(cd genark2jbrowse && ./makeAll.sh && ./uploadAll.sh) 2>&1 | tee -a "$LOG_FILE"

# Run ucsc2jbrowse/doAll.sh
echo "Running ucsc2jbrowse/doAll.sh..." | tee -a "$LOG_FILE"
(cd ucsc2jbrowse && ./doAll.sh && ./uploadAll.sh) 2>&1 | tee -a "$LOG_FILE"

# Extract SyntenyTrack datasets
echo "Extracting SyntenyTrack datasets..." | tee -a "$LOG_FILE"
node extractSyntenyTracks.ts 2>&1 | tee -a "$LOG_FILE"

echo "Running website deploy..." | tee -a "$LOG_FILE"
(cd website && yarn deploy) 2>&1 | tee -a "$LOG_FILE"

git add .
git commit -m "Updates"
git push

echo "Log saved to $LOG_FILE"
