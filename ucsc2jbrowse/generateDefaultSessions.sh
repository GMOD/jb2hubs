#!/bin/bash

#
# generateDefaultSessions.sh
#
# Generates defaultSession JSON files for all assemblies in list.json
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

log "Using UCSC_BUILT_DIR: $UCSC_BUILT_DIR"

node src/generateDefaultSessions.ts
