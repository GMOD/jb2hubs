#!/bin/bash
#
# make.sh
#
# Main build script for ucsc2jbrowse.
#
# Usage:
#   ./make.sh                  # Download + process (default)
#   ./make.sh --skip-download  # Skip download, just process
#   ./make.sh --reprocess-all  # Force reprocess everything
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

# Parse arguments
SKIP_DOWNLOAD=false
for arg in "$@"; do
  case $arg in
    --skip-download)
      SKIP_DOWNLOAD=true
      shift
      ;;
    --reprocess-all)
      export REPROCESS=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  (default)          Download and process all assemblies"
      echo "  --skip-download    Skip download, just process existing data"
      echo "  --reprocess-all    Force reprocess everything (ignores cached hashes)"
      echo "  --help, -h         Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# --- Configuration ---

export CHECK_404=true
export TMPDIR="${TMPDIR:-/mnt/sdb/cdiesh/tmp}"
: ${UCSC_ALT_DATA_DIR:=~/ucscAlt}

# Ensure the script's path is in the PATH for tool access.
export PATH="$SCRIPT_DIR:$PATH"

# --- Phase 1: Download ---

if [ "$SKIP_DOWNLOAD" = false ]; then
  log "Starting UCSC data download."

  ensure_dir "$UCSC_RESULTS_DIR"

  log "Fetching latest UCSC genome list..."
  curl -s https://api.genome.ucsc.edu/list/ucscGenomes >"$UCSC_RESULTS_DIR/list.json"

  log "Downloading non-hub assemblies..."
  jq -r '.ucscGenomes | to_entries[] | select(.value.nibPath | (. != null and startswith("hub:") | not)) | .key' "$UCSC_RESULTS_DIR/list.json" | while read -r assembly; do
    if [ "$assembly" = "cb1" ]; then
      log "Skipping $assembly genome."
      continue
    fi
    log "Syncing $assembly data..."
    ensure_dir "$UCSC_DATA_DIR/$assembly/$assembly"
    rsync --max-size=2G -qavzP rsync://hgdownload.cse.ucsc.edu/goldenPath/"$assembly"/database "$UCSC_DATA_DIR/$assembly/$assembly/"
  done

  log "Downloading hgFixed assembly..."
  ensure_dir "$UCSC_ALT_DATA_DIR/hgFixed/hgFixed"
  rsync --max-size=2G -azP rsync://hgdownload.cse.ucsc.edu/goldenPath/hgFixed/database "$UCSC_ALT_DATA_DIR/hgFixed/hgFixed/"

  log "Download finished successfully!"
else
  log "Skipping download (--skip-download specified)"
fi

# --- Phase 2: Process ---

log "Starting the UCSC to JBrowse data processing pipeline."

ensure_dir "$UCSC_RESULTS_DIR"
ensure_dir "configs"

# Clear the old blocked files text format. Keep blockedFiles/ directory to preserve timestamps.
# Clear old merged files (they will be regenerated)
rm -f blockedFiles.txt blockedFiles.json removedTracks.json

# Only fetch list.json if we skipped download (otherwise it's already fresh)
if [ "$SKIP_DOWNLOAD" = true ]; then
  log "Fetching latest UCSC genome list..."
  curl -s https://api.genome.ucsc.edu/list/ucscGenomes >"$UCSC_RESULTS_DIR/list.json.raw"

  log "Transforming genome list to array format..."
  node src/transformGenomeList.ts "$UCSC_RESULTS_DIR/list.json.raw" "$UCSC_RESULTS_DIR/list.json"
else
  log "Transforming genome list to array format..."
  # Use the list.json from download phase
  cp "$UCSC_RESULTS_DIR/list.json" "$UCSC_RESULTS_DIR/list.json.raw"
  node src/transformGenomeList.ts "$UCSC_RESULTS_DIR/list.json.raw" "$UCSC_RESULTS_DIR/list.json"
fi

log "Creating a copy for the website..."
cp "$UCSC_RESULTS_DIR/list.json" "$SCRIPT_DIR/../website/src/list.json"

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

log "Download and add GENCODE tracks"
./downloadGencode.sh

log "Creating minimal configs (NCBI, GENCODE, RepeatMasker, ClinVar, Gaps only)..."
./createMinimalConfigs.sh "$UCSC_RESULTS_DIR"

log "Generating default sessions for all assemblies..."
./generateDefaultSessions.sh

log "Copying generated config files to the local 'configs' directory..."
fd "config.json$" "$UCSC_RESULTS_DIR"/ | { grep -v "meta.json" || true; } | parallel $PARALLEL_OPTS -I {} 'cp {} configs/$(basename $(dirname {})).json'

log "Merging all assembly configs into a single file..."
node src/mergeAll.ts

log "Merging blocked files caches..."
node src/mergeBlockedFiles.ts

log "Merging removed tracks..."
node src/mergeRemovedTracks.ts

log "Hashing all output files for integrity checking..."
find "$UCSC_RESULTS_DIR"/ -type f ! -name "*meta.json" ! -name "*.xxh" ! -name "*.hash" | parallel $PARALLEL_OPTS ./hash_if_needed.sh {} | LC_ALL=C sort -k2,2 >fileListing.txt

log "Pipeline finished successfully!"

aws s3 cp defaultFavs.json s3://jbrowse.org/hubs/defaultFavs.json
