#!/bin/bash

#
# generateDefaultSessions.sh
#
# Generates defaultSession JSON files for all assemblies in list.json
#

source "$(dirname "$0")/common.sh"

log "Using UCSC_RESULTS_DIR: $UCSC_RESULTS_DIR"

node src/generateDefaultSessions.ts
