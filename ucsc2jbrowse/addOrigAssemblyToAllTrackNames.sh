#!/bin/bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

find "$UCSC_BUILT_DIR" -type f -name "config.json" | parallel $PARALLEL_OPTS -j1 node src/addOrigAssemblyToTrackName.ts {}
