#!/bin/bash
#
# makePifs.sh
#
# Processes all GenArk assemblies to download liftOver chain files and convert them to PIF format.
# This script finds all meta.json files and processes them in parallel.

set -e

# Set NODE_OPTIONS to suppress experimental warnings
export NODE_OPTIONS="--no-warnings=ExperimentalWarning"

if [ -t 1 ]; then
  PARALLEL_OPTS="--bar"
else
  PARALLEL_OPTS=""
fi
export PARALLEL_OPTS

echo "Processing liftOver chains for all GenArk assemblies..."
fd meta.json hubs | parallel $PARALLEL_OPTS './createChainTrackPifs.sh {}'

echo "Adding chain tracks to configs..."
fd meta.json hubs | parallel $PARALLEL_OPTS 'node src/createChainTracks.ts {}'

echo "Done! Chain tracks have been processed and added to configs."
