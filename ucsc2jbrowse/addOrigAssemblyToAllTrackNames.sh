#!/bin/bash
set -e

if [ -z "$UCSC_RESULTS_DIR" ]; then
  echo "Error: UCSC_RESULTS_DIR environment variable is not set."
  exit 1
fi

find "$UCSC_RESULTS_DIR" -type f -name "config.json" | parallel --bar -j1 node src/addOrigAssemblyToTrackName.ts {}
