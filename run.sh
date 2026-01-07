#!/bin/bash
set -e

SCRIPT_DIR="$(dirname "$0")"
cd "$SCRIPT_DIR"

# Run the dry run (build everything, no uploads)
./dryRun.sh

# Upload, commit, generate recently updated, deploy website, and push
./completeRun.sh
