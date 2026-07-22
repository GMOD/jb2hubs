#!/bin/bash
#
# make.sh
#
# Main build script for ucsc2jbrowse.
#
# Usage:
#   ./make.sh                  # Download + process changed assemblies (default)
#   ./make.sh --all            # Process every assembly, not just changed ones
#   ./make.sh --skip-download  # Skip the rsync, just process (implies --all)
#   ./make.sh --reprocess-all  # Force reprocess everything from cached downloads
#
# --reprocess-all re-derives every config from already-downloaded data; it does
# not re-pull NCBI RefSeq GFFs (set FETCH_UPDATES=1 for that). The UCSC rsync it
# still runs is incremental, so an already-synced tree transfers almost nothing.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

# Parse arguments. --all, --reprocess-all and --help are handled by parse_flags.
SKIP_DOWNLOAD=false
PROCESS_ALL=false
USAGE="Usage: $0 [OPTIONS]

Options:
  (default)        Download, then process assemblies whose trackDb changed
  --skip-download  Skip the UCSC rsync and process what is already on disk
                   (implies --all, since there are no fresh hashes to compare)"
handle_flag() {
  case "$1" in
  --skip-download)
    SKIP_DOWNLOAD=true
    PROCESS_ALL=true
    ;;
  *) return 1 ;;
  esac
}
parse_flags "$@"

# --- Configuration ---

export CHECK_404=true
export TMPDIR="${TMPDIR:-/mnt/sdb/cdiesh/tmp}"

# Ensure the script's path is in the PATH for tool access.
export PATH="$SCRIPT_DIR:$PATH"

# --- Phase 1: Download ---

ensure_dir "$UCSC_BUILT_DIR"

if [ "$SKIP_DOWNLOAD" = false ]; then
  log "Starting UCSC data download."

  log "Fetching latest UCSC genome list..."
  curl -s https://api.genome.ucsc.edu/list/ucscGenomes >"$UCSC_BUILT_DIR/list.json.raw"

  # hg19, hg38, mm39, rn6 are synced every run; everything else at most once per month.
  FREQUENT_ASSEMBLIES="hg19 hg38 mm39 rn6"
  RSYNC_MONTHLY_DAYS=30
  age_days=0 # set by stamp_age_days below

  log "Downloading non-hub assemblies..."
  jq -r '.ucscGenomes | to_entries[] | select(.value.nibPath | (. != null and startswith("hub:") | not)) | .key' "$UCSC_BUILT_DIR/list.json.raw" | while read -r assembly; do
    if ! is_assembly_db "$assembly"; then
      log "Skipping $assembly genome."
      continue
    fi

    sync_stamp="$UCSC_DOWNLOADS_DIR/$assembly/.sync_stamp"

    # For infrequent assemblies, skip rsync if synced within the last month
    if [ -z "${REPROCESS:-}" ] && ! echo "$FREQUENT_ASSEMBLIES" | grep -qw "$assembly"; then
      if stamp_age_days age_days "$sync_stamp" && [ "$age_days" -lt "$RSYNC_MONTHLY_DAYS" ]; then
        log "Skipping rsync for $assembly (synced ${age_days}d ago)"
        continue
      fi
    fi

    log "Syncing $assembly data..."
    ensure_dir "$UCSC_DOWNLOADS_DIR/$assembly/$assembly"
    rsync --max-size=2G -qavzP rsync://hgdownload.cse.ucsc.edu/goldenPath/"$assembly"/database "$UCSC_DOWNLOADS_DIR/$assembly/$assembly/"
    touch "$sync_stamp"
  done

  log "Downloading hgFixed assembly..."
  ensure_dir "$UCSC_DOWNLOADS_DIR/hgFixed/hgFixed"
  rsync --max-size=2G -azP rsync://hgdownload.cse.ucsc.edu/goldenPath/hgFixed/database "$UCSC_DOWNLOADS_DIR/hgFixed/hgFixed/"

  log "Download finished successfully!"
else
  log "Skipping download (--skip-download specified)"
fi

# --- Phase 1b: Detect changed assemblies ---
#
# For each assembly, compare the size of trackDb.txt.gz against a stored hash.
# Assemblies where the hash differs (or no config.json exists yet) are "changed"
# and need to go through the full processing pipeline.  Unchanged assemblies
# keep their existing built outputs from the previous run.
#
# Skip change detection when --all (or anything implying it) is active so those
# modes process everything.

CHANGED_DL_DIRS=()
CHANGED_BUILT_DIRS=()

if [ "$PROCESS_ALL" = true ]; then
  log "Processing all assemblies (--all)..."
  while IFS= read -r assembly_data_dir; do
    assembly=$(basename "$assembly_data_dir")
    CHANGED_DL_DIRS+=("$assembly_data_dir")
    CHANGED_BUILT_DIRS+=("$UCSC_BUILT_DIR/$assembly")
  done < <(list_assembly_dirs)
else
  log "Detecting changed assemblies..."
  while IFS= read -r assembly_data_dir; do
    assembly=$(basename "$assembly_data_dir")
    db_dir="$assembly_data_dir/$assembly/database"
    trackdb="$db_dir/trackDb.txt.gz"
    built_dir="$UCSC_BUILT_DIR/$assembly"
    hash_file="$built_dir/.trackdb_hash"

    if [ ! -f "$trackdb" ]; then
      continue
    fi

    current_hash=$(xxhsum -H3 "$trackdb" | awk '{print $NF}')
    stored_hash=$(cat "$hash_file" 2>/dev/null || echo "")

    if [ "$current_hash" = "$stored_hash" ] && [ -f "$built_dir/config.json" ]; then
      continue # unchanged
    fi

    CHANGED_DL_DIRS+=("$assembly_data_dir")
    CHANGED_BUILT_DIRS+=("$built_dir")
  done < <(list_assembly_dirs)

  if [ "${#CHANGED_DL_DIRS[@]}" -eq 0 ]; then
    log "No UCSC assemblies have changed."
  else
    changed_names=()
    for d in "${CHANGED_DL_DIRS[@]}"; do changed_names+=("$(basename "$d")"); done
    log "${#CHANGED_DL_DIRS[@]} changed assembly/assemblies: ${changed_names[*]}"
  fi
fi

# --- Phase 2: Process ---

log "Starting the UCSC to JBrowse data processing pipeline."

ensure_dir "configs"

# Clear the old blocked files text format. Keep blockedFiles/ directory to preserve timestamps.
# Clear old merged files (they will be regenerated)
rm -f blockedFiles.txt blockedFiles.json removedTracks.json

# The download phase already wrote list.json.raw; fetch it here only if we
# skipped that phase.
if [ "$SKIP_DOWNLOAD" = true ]; then
  log "Fetching latest UCSC genome list..."
  curl -s https://api.genome.ucsc.edu/list/ucscGenomes >"$UCSC_BUILT_DIR/list.json.raw"
fi

# Keeps the ucscGenomes object shape (later phases and
# generateJBrowseConfigForAssemblyHub.sh both jq '.ucscGenomes | to_entries[]'
# over it), adding per-genome fields the website needs.
log "Enriching genome list..."
node src/transformGenomeList.ts "$UCSC_BUILT_DIR/list.json.raw" "$UCSC_BUILT_DIR/list.json"

log "Creating a copy for the website..."
cp "$UCSC_BUILT_DIR/list.json" "$SCRIPT_DIR/../website/src/list.json"

if [ "${#CHANGED_DL_DIRS[@]}" -gt 0 ]; then
  log "Creating initial assembly configurations for ${#CHANGED_DL_DIRS[@]} changed assemblies..."
  ./createAssemblies.sh "${CHANGED_DL_DIRS[@]}"

  log "Extracting track definitions from trackDb..."
  ./createTracksJsonForGoldenPath.sh "${CHANGED_DL_DIRS[@]}"

  log "Creating BED tracks..."
  ./createBedTracksForGoldenPath.sh "${CHANGED_DL_DIRS[@]}"

  log "Creating RepeatMasker tracks..."
  ./createRmskTracksForGoldenPath.sh "${CHANGED_DL_DIRS[@]}"

  log "Creating gene tracks..."
  ./createGeneTracksForGoldenPath.sh "${CHANGED_DL_DIRS[@]}"

  log "Generating JBrowse track configurations..."
  ./createConfigsForGoldenPath.sh "${CHANGED_DL_DIRS[@]}"

  log "Performing text indexing for search..."
  ./textIndexGoldenPath.sh "${CHANGED_BUILT_DIRS[@]}"
else
  log "Skipping per-assembly processing (no changes detected)"
fi

# --- Phase 3: Global processing (always runs) ---
# These steps handle hub assemblies, extension tracks, and cross-assembly concerns.
# They must run before the post-processing steps below, and must see the full built dir.

log "Creating configurations from track hubs..."
./generateJBrowseConfigForAssemblyHub.sh

log "Adding non-UCSC 'extension' tracks..."
node src/makeUcscExtensions.ts "$UCSC_BUILT_DIR"

log "Downloading and processing NCBI RefSeq GFFs..."
./downloadNcbiGff.sh

log "Creating chain track PIFs..."
./makePifs.sh

log "Making hs1 PIFs"
./processHs1LiftOver.sh

# --- Phase 4: Post-processing (changed assemblies + hub assemblies) ---
# These steps refine configs that were created or updated in phases 2-3.
# The ordering here matches the original pipeline: metadata → rename → enhance → gencode.
# Hub assemblies (hs1, etc.) are always included since they're rebuilt in phase 3.

# Build the list of dirs that need post-processing
POST_PROCESS_DIRS=("${CHANGED_BUILT_DIRS[@]}")

# Always include hub assemblies (rebuilt by generateJBrowseConfigForAssemblyHub)
while IFS= read -r hub_assembly; do
  hub_dir="$UCSC_BUILT_DIR/$hub_assembly"
  if [ -d "$hub_dir" ]; then
    POST_PROCESS_DIRS+=("$hub_dir")
  fi
done < <(jq -r '.ucscGenomes | to_entries[] | select(.value.nibPath | (. != null and startswith("hub:"))) | .key' "$UCSC_BUILT_DIR/list.json" 2>/dev/null)

if [ "${#POST_PROCESS_DIRS[@]}" -gt 0 ]; then
  log "Adding metadata to tracks..."
  ./addMetadata.sh "${POST_PROCESS_DIRS[@]}"

  log "Adding original assembly to track name..."
  ./addOrigAssemblyToAllTrackNames.sh "${POST_PROCESS_DIRS[@]}"

  log "Renaming some tracks..."
  node src/rewriteUcscTrackNames.ts "$UCSC_BUILT_DIR"

  log "Enhancing configs with plugins and hierarchical configuration..."
  ./enhanceConfigs.sh "${POST_PROCESS_DIRS[@]}"

  log "Adding mitochondrial genetic codes..."
  gc_configs=()
  for d in "${POST_PROCESS_DIRS[@]}"; do
    if [ -f "$d/config.json" ]; then
      gc_configs+=("$d/config.json")
    fi
  done
  if [ "${#gc_configs[@]}" -gt 0 ]; then
    node src/addGeneticCodes.ts "${gc_configs[@]}" || true
  fi
fi

log "Download and add GENCODE tracks"
./downloadGencode.sh

log "Ensuring refNameAliases/cytobands are present for all golden-path assemblies..."
node src/ensureAssemblyAliasesAndCytobands.ts "$UCSC_BUILT_DIR" "$UCSC_DOWNLOADS_DIR"

log "Ensuring UCSC db names are aliased on GenArk-backed hub assemblies..."
node src/ensureUcscAssemblyNames.ts "$UCSC_BUILT_DIR"

log "Ensuring text search adapters are present for all assemblies with trix files..."
node src/ensureTextSearchAdapters.ts "$UCSC_BUILT_DIR"

log "Generating default sessions for all assemblies..."
./generateDefaultSessions.sh

log "Creating minimal configs (NCBI, GENCODE, RepeatMasker, ClinVar, Gaps only)..."
./createMinimalConfigs.sh "$UCSC_BUILT_DIR"

log "Copying generated config files to the local 'configs' directory..."
fd "config.json$" "$UCSC_BUILT_DIR"/ | parallel $PARALLEL_OPTS -I {} "cp {} configs/\$(basename \$(dirname {})).json"

log "Merging all assembly configs into a single file..."
node src/mergeAll.ts

log "Merging blocked files caches..."
node src/mergeBlockedFiles.ts

log "Merging removed tracks..."
node src/mergeRemovedTracks.ts

log "Hashing output files for integrity checking..."
make_file_listing fileListing.txt "$UCSC_BUILT_DIR" \
  ! -name "*meta.json" ! -name "*.hash" ! -name ".trackdb_hash" ! -name ".sync_stamp"

# Write updated hashes for assemblies we just processed
if [ "${#CHANGED_DL_DIRS[@]}" -gt 0 ] && [ -z "${REPROCESS:-}" ] && [ "$SKIP_DOWNLOAD" = false ]; then
  for assembly_data_dir in "${CHANGED_DL_DIRS[@]}"; do
    assembly=$(basename "$assembly_data_dir")
    trackdb="$assembly_data_dir/$assembly/database/trackDb.txt.gz"
    if [ -f "$trackdb" ]; then
      xxhsum -H3 "$trackdb" | awk '{print $NF}' >"$UCSC_BUILT_DIR/$assembly/.trackdb_hash"
    fi
  done
fi

log "Pipeline finished successfully!"
