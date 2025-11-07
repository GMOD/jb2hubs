#!/bin/bash

#
# generateDefaultSessions.sh
#
# Generates defaultSession JSON files for all assemblies in list.json
#

# Set the root directory for UCSC results
: ${UCSC_RESULTS_DIR:=~/ucscResults}
export UCSC_RESULTS_DIR

echo "Using UCSC_RESULTS_DIR: $UCSC_RESULTS_DIR"

# Run the TypeScript script
node src/generateDefaultSessions.ts
