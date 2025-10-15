#!/bin/bash
# set -e

# Set NODE_OPTIONS to suppress experimental warnings
export NODE_OPTIONS="--no-warnings=ExperimentalWarning"

if [ -t 1 ]; then
  PARALLEL_OPTS="--bar"
else
  PARALLEL_OPTS=""
fi
export PARALLEL_OPTS

echo "Downloading list of hubs..."
node src/downloadHubList.ts

echo "Downloading actual hub.txt files..."
node src/downloadHubs.ts

echo "Fetching NCBI metadata..."
./fetchNcbiMetadata.sh

echo "Processing hub JSON data..."
node src/processHubJson.ts

echo "Processing UCSC list data..."
node src/processUcscList.ts

echo "Generating JBrowse 2 config.json for each hub..."
fd meta.json hubs | parallel $PARALLEL_OPTS node src/generateConfigs.ts {}

echo "Downloading NCBI GFF files..."
./downloadNcbiGff.sh

echo "Processing NCBI GFF files..."
./processGffFiles.sh

echo "Loading and text indexing NCBI GFF tracks..."
./addTracksAndTextIndex.sh

echo "Adding GenArk extensions (special tracks)..."
node src/makeGenArkExtensions.ts

echo "Fetching wiki images"
./getWikiImages.sh

echo "Calculate gff file hashes"
./getFileListing.sh

sleep 1 # Small pause

echo "Formatting codebase..."
cd ..
yarn format
cd -
