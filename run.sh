#!/bin/bash
set -e

LOG_FILE=$(mktemp)
echo $LOG_FILE

# Run genark2jbrowse/makeAll.sh
echo "Running genark2jbrowse/makeAll.sh..." | tee -a "$LOG_FILE"
(cd genark2jbrowse && ./makeAll.sh && ./uploadAll.sh) 2>&1 | tee -a "$LOG_FILE"

# Run ucsc2jbrowse/doAll.sh
echo "Running ucsc2jbrowse/doAll.sh..." | tee -a "$LOG_FILE"
(cd ucsc2jbrowse && ./doAll.sh && ./uploadAll.sh) 2>&1 | tee -a "$LOG_FILE"

# Extract SyntenyTrack datasets
echo "Extracting SyntenyTrack datasets..." | tee -a "$LOG_FILE"
npx tsx extractSyntenyTracks.ts 2>&1 | tee -a "$LOG_FILE"

echo "Running website deploy..." | tee -a "$LOG_FILE"
(cd website && yarn deploy) 2>&1 | tee -a "$LOG_FILE"

git add .
git commit -m "Updates"
git push

# Clean up the log file
rm "$LOG_FILE"
