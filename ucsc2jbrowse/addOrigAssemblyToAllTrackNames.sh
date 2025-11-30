#!/bin/bash
set -e

source "$(dirname "$0")/common.sh"

find "$UCSC_RESULTS_DIR" -type f -name "config.json" | parallel $PARALLEL_OPTS -j1 node src/addOrigAssemblyToTrackName.ts {}
