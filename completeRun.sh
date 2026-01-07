#!/bin/bash
set -e
export NODE_OPTIONS="--experimental-strip-types"

SCRIPT_DIR="$(dirname "$0")"
cd "$SCRIPT_DIR"

echo "Uploading genark data..."
./genark2jbrowse/uploadAll.sh

echo "Uploading ucsc data..."
./ucsc2jbrowse/uploadAll.sh

echo "Committing hub changes before generating recently updated..."
git add hubs/ website/processedHubJson/ website/hubJson/
git commit -m "Update hubs" || echo "No hub changes to commit"

echo "Generating recently updated data..."
node website/generateRecentlyUpdated.ts

echo "Running website deploy..."
yarn --cwd website deploy

git add .
git commit -m "Updates" || echo "No additional changes to commit"
git push

echo "Done!"
