#!/bin/bash

SCRIPT_DIR="$(dirname "$0")"
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

log "Downloading list of hubs..."
node src/downloadHubList.ts

log "Downloading actual hub.txt files..."
node src/downloadHubs.ts

log "Fetching NCBI metadata..."
./fetchNcbiMetadata.sh

log "Processing hub JSON data..."
node src/processHubJson.ts

log "Processing UCSC list data..."
node src/processUcscList.ts

log "Generating JBrowse 2 config.json for each hub..."
fd meta.json hubs | parallel $PARALLEL_OPTS node src/generateConfigs.ts {}

log "Downloading NCBI GFF files..."
./downloadNcbiGff.sh

log "Processing NCBI GFF files..."
./processGffFiles.sh

log "Loading and text indexing NCBI GFF tracks..."
./addNcbiGffAndTextIndex.sh

log "Adding GenArk extensions (special tracks)..."
node src/makeGenArkExtensions.ts

log "Processing liftOver chain files and creating PIFs..."
fd meta.json hubs | parallel $PARALLEL_OPTS './createChainTrackPifs.sh {}'

log "Adding chain tracks to configs..."
fd meta.json hubs | parallel $PARALLEL_OPTS 'node src/createChainTracks.ts {}'

log "Fetching wiki images..."
./getWikiImages.sh

log "Calculating gff file hashes..."
./getFileListing.sh
