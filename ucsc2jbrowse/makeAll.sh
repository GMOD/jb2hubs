#!/bin/bash

#
# makeAll.sh
#
# Main orchestration script to download, process, and configure UCSC data for JBrowse.
#

# set -euo pipefail

# --- Configuration ---

# Set the root directory for UCSC data and results.
# Can be overridden by setting the environment variable.
: ${UCSC_DATA_DIR:=~/ucsc}
: ${UCSC_RESULTS_DIR:=~/ucscResults}
export UCSC_RESULTS_DIR
export CHECK_404=true
export TMPDIR=/mnt/sdb/cdiesh/tmp

# Ensure the script's path is in the PATH for tool access.
export PATH=$(pwd):$PATH

# Suppress Node.js experimental warnings.
export NODE_OPTIONS="--no-warnings=ExperimentalWarning"

if [ -t 1 ]; then
  PARALLEL_OPTS="--bar"
else
  PARALLEL_OPTS=""
fi
export PARALLEL_OPTS

# --- Functions ---

# Logs a message with a timestamp.
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Creates a directory if it doesn't exist.
# $1: Directory path
ensure_dir() {
  mkdir -p "$1"
}

# --- Main Script ---

log "Starting the UCSC to JBrowse data processing pipeline."

# Create necessary directories.
ensure_dir "$UCSC_RESULTS_DIR"
ensure_dir "configs"

# Clear the blocked files list at the start of a run.
rm -f blockedFiles.txt

log "Fetching latest UCSC genome list..."
curl -s https://api.genome.ucsc.edu/list/ucscGenomes >"$UCSC_RESULTS_DIR/list.json"
# Create a copy for the website.
cp "$UCSC_RESULTS_DIR/list.json" ../website/src/list.json

log "Creating initial assembly configurations..."
./createAssemblies.sh "$UCSC_DATA_DIR"/*

log "Extracting track definitions from trackDb..."
./createTracksJsonForGoldenPath.sh "$UCSC_DATA_DIR"/*

log "Creating BED tracks..."
./createBedTracksForGoldenPath.sh "$UCSC_DATA_DIR"/*

log "Creating RepeatMasker tracks..."
./createRmskTracksForGoldenPath.sh "$UCSC_DATA_DIR"/*

log "Creating gene tracks..."
./createGeneTracksForGoldenPath.sh "$UCSC_DATA_DIR"/*

log "Generating JBrowse track configurations..."
./createConfigsForGoldenPath.sh "$UCSC_DATA_DIR"/*

log "Performing text indexing for search..."
./textIndexGoldenPath.sh "$UCSC_RESULTS_DIR"/*

log "Creating configurations from track hubs..."
./generateJBrowseConfigForAssemblyHub.sh

log "Adding non-UCSC 'extension' tracks..."
node src/makeUcscExtensions.ts "$UCSC_RESULTS_DIR"

log "Downloading and processing hs1 GFF..."
./downloadNcbiGff.sh

log "Creating chain track PIFs..."
./makePifs.sh

log "Making hs1 PIFs"
./processHs1LiftOver.sh

log "Adding metadata to tracks..."
./addMetadata.sh "$UCSC_RESULTS_DIR"

log "Adding original assembly to track name (e.g. if an older track was lifted from hg19 to hg38, add hg19 label)"
./addOrigAssemblyToAllTrackNames.sh

log "Renaming some tracks..."
node src/rewriteUcscTrackNames.ts "$UCSC_RESULTS_DIR"

log "Enhancing configs with plugins and hierarchical configuration..."
./enhanceConfigs.sh

log "Copying generated config files to the local 'configs' directory..."
fd "config.json$" "$UCSC_RESULTS_DIR"/ | grep -v "meta.json" | parallel $PARALLEL_OPTS -I {} 'cp {} configs/$(basename $(dirname {})).json'

log "Merging all assembly configs into a single file..."
node src/mergeAll.ts

log "Sorting the list of blocked files..."
if [ -f blockedFiles.txt ]; then
  sort blockedFiles.txt >blockedFiles.txt.tmp && mv blockedFiles.txt.tmp blockedFiles.txt
fi

echo "Formatting codebase..."
cd ..
yarn format
cd -

log "Hashing all output files for integrity checking..."
find "$UCSC_RESULTS_DIR"/ -type f ! -name "*meta.json" ! -name "*.xxh" ! -name "*.hash" | parallel $PARALLEL_OPTS ./hash_if_needed.sh {} | sort -k2,2 >fileListing.txt

log "Pipeline finished successfully!"

aws s3 cp defaultFavs.json s3://jbrowse.org/hubs/defaultFavs.json
