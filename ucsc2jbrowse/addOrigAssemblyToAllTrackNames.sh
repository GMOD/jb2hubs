#!/bin/bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

# find yields unique config paths and each invocation only rewrites its own
# config.json, so there is no shared-write hazard and no need to serialize (-j1).
find "$UCSC_BUILT_DIR" -type f -name "config.json" | parallel $PARALLEL_OPTS node src/addOrigAssemblyToTrackName.ts {}
