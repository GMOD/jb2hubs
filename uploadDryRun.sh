#!/bin/bash
set -e

SCRIPT_DIR="$(dirname "$0")"
cd "$SCRIPT_DIR"

echo "Uploading genark data..."
./genark2jbrowse/uploadAll.sh

echo "Uploading ucsc data..."
./ucsc2jbrowse/uploadAll.sh

echo "Running website deploy..."
yarn --cwd website deploy

git add .
git commit -m "Updates"
git push

echo "Done!"
