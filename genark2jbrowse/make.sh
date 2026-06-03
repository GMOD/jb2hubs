#!/bin/bash
#
# make.sh
#
# Main build script for genark2jbrowse.
#
# Usage:
#   ./make.sh                 # Process only new hubs (default, fastest)
#   ./make.sh --all           # Process all hubs
#   ./make.sh --reprocess-all # Re-download and reprocess everything
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

# Parse arguments
MODE="new"
for arg in "$@"; do
  case $arg in
  --all)
    MODE="all"
    ;;
  --reprocess-all)
    MODE="reprocess"
    export REPROCESS=true
    ;;
  --help | -h)
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  (default)        Process only new hubs (fastest)"
    echo "  --all            Process all hubs"
    echo "  --reprocess-all  Re-download and reprocess everything"
    echo "  --help, -h       Show this help message"
    echo ""
    echo "Environment variables (full/--all runs):"
    echo "  FETCH_UPDATES=1  Re-check NCBI and re-download GFFs changed in place"
    echo "                   (wget -N); regeneration then cascades by timestamp"
    echo "  REPROCESS=1      Force re-derivation of outputs regardless of timestamps"
    exit 0
    ;;
  *)
    echo "Unknown option: $arg"
    echo "Use --help for usage information"
    exit 1
    ;;
  esac
done

# Temp files for intermediate data (used in new-only mode)
NEW_HUBS_FILE=$(mktemp)
NEW_ACCESSIONS_FILE=$(mktemp)
NEW_HUB_DATA=$(mktemp)

cleanup() {
  rm -f "$NEW_HUBS_FILE" "$NEW_ACCESSIONS_FILE" "$NEW_HUB_DATA" "${ALL_META_FILE:-}" 2>/dev/null || true
}
trap cleanup EXIT

log "Mode: $MODE"

# --- Phase 1: Download hub list and hub.txt files ---

log "Downloading list of hubs..."
node src/downloadHubList.ts

log "Downloading hub.txt files..."
if [ "$MODE" = "new" ]; then
  # Capture new hubs for incremental processing
  node src/downloadHubs.ts >"$NEW_HUBS_FILE"

  if [ ! -s "$NEW_HUBS_FILE" ]; then
    log "No new hubs found. Nothing to process."
    exit 0
  fi

  NEW_HUB_COUNT=$(wc -l <"$NEW_HUBS_FILE")
  log "Found $NEW_HUB_COUNT new hub(s) to process"

  # Extract accessions from new hubs
  sed 's|/meta\.json$||; s|.*/||' "$NEW_HUBS_FILE" >"$NEW_ACCESSIONS_FILE"
else
  # Download all (output goes to stderr, stdout has new hubs which we ignore)
  node src/downloadHubs.ts >/dev/null
fi

# --- Phase 2: Fetch metadata ---

log "Fetching NCBI metadata..."
if [ "$MODE" = "new" ]; then
  # Fetch only for new hubs using datasets CLI (bulk)
  NCBI_RESULT_DIR=$(mktemp -d)

  new_count=$(wc -l <"$NEW_ACCESSIONS_FILE")
  echo "Fetching NCBI data for $new_count new assemblies..."
  batch_result=$(mktemp)
  datasets_err=$(mktemp)
  if datasets summary genome accession --inputfile "$NEW_ACCESSIONS_FILE" >"$batch_result" 2>"$datasets_err"; then
    # Split into per-accession files
    if jq -e '.reports' "$batch_result" >/dev/null 2>&1; then
      jq -r '.reports[] |
        {reports: [.], total_count: 1} as $wrapped |
        .accession as $acc |
        ($wrapped | tostring) as $json |
        "\($acc)\n\($json)"
      ' "$batch_result" | awk -v dir="$NCBI_RESULT_DIR" 'NR%2==1 {filename=$0; next} {print > (dir "/" filename ".json")}'
    fi
  else
    echo "Warning: datasets CLI failed: $(grep -v 'New version' "$datasets_err" 2>/dev/null)"
  fi
  rm -f "$datasets_err"

  # Copy to hub directories
  while read -r meta_file; do
    dir="${meta_file%/meta.json}"
    id="${dir##*/}"
    if [ -f "$NCBI_RESULT_DIR/$id.json" ]; then
      jq --argjson ts "$(date +%s)" '. + {downloaded_at: $ts}' "$NCBI_RESULT_DIR/$id.json" >"$dir/ncbi.json"
      echo "Saved NCBI data for $id"
    else
      echo "Warning: No datasets result for $id"
    fi
  done <"$NEW_HUBS_FILE"

  rm -f "$batch_result"
  rm -rf "$NCBI_RESULT_DIR"
else
  ./fetchNcbiMetadata.sh
fi

log "Processing hub JSON data..."
node src/processHubJson.ts

log "Processing UCSC list data..."
node src/processUcscList.ts

# --- Phase 3: Generate configs ---

# Cache fd results for "all" mode to avoid repeated directory traversals
if [ "$MODE" != "new" ]; then
  ALL_META_FILE=$(mktemp)
  fd '^meta\.json$' hubs >"$ALL_META_FILE"
  log "Found $(wc -l <"$ALL_META_FILE") hub assemblies"
fi

log "Generating JBrowse 2 config.json..."
if [ "$MODE" = "new" ]; then
  node src/generateConfigsBatch.ts <"$NEW_HUBS_FILE"
else
  node src/generateConfigsBatch.ts <"$ALL_META_FILE"
fi

# --- Phase 4: Download and process GFF files ---

log "Downloading NCBI GFF files..."
mkdir -p gff
if [ "$MODE" = "new" ]; then
  # Pre-filter all.json to only new hub accessions
  jq --slurpfile accs <(jq -R -s 'split("\n") | map(select(length > 0))' "$NEW_ACCESSIONS_FILE") \
    '[.[] | select(.accession as $a | $accs[0] | index($a))]' processedHubJson/all.json >"$NEW_HUB_DATA"

  download_gff_for_hub() {
    local line="$1"
    local url
    url=$(echo "$line" | cut -d'|' -f1)
    local common_name
    common_name=$(echo "$line" | cut -d'|' -f2)

    if [ -z "$url" ] || [ "$url" = "null" ]; then
      return
    fi

    local filename
    filename=$(basename "$url")
    if [ ! -f "gff/$filename" ]; then
      echo "Downloading GFF file for $common_name: $url"
      wget -nc -q "$url" -P gff || echo "Failed to download $url" >&2
    fi
  }
  export -f download_gff_for_hub
  jq -r '.[] | select(.ncbiGff != null) | select(.ncbiGff | test("GCF_")) | "\(.ncbiGff)|\(.commonName // "Unknown")"' "$NEW_HUB_DATA" |
    parallel -j1 $PARALLEL_OPTS download_gff_for_hub {}
else
  ./downloadNcbiGff.sh
fi

log "Processing NCBI GFF files..."
mkdir -p bgz
if [ "$MODE" = "new" ]; then
  process_gff_for_hub() {
    set -o pipefail
    local accession="$1"
    local input_file
    input_file=$(echo gff/"${accession}"_*.gz)
    if [ ! -f "$input_file" ]; then
      return
    fi

    local filename
    filename=$(basename "$input_file")
    local output_bgz_file="bgz/$filename"

    if [ -f "$output_bgz_file" ]; then
      return
    fi

    echo "Processing GFF file: $filename"
    local unzipped_file="${input_file%.gz}"
    pigz -dc "$input_file" | awk -F"\t" 'BEGIN{OFS="\t"} {if ($4 > $5) {temp=$4; $4=$5; $5=temp} print}' >"$unzipped_file"
    jbrowse sort-gff "$unzipped_file" | bgzip -@2 >"$output_bgz_file"
    tabix -C "$output_bgz_file"
    rm "$unzipped_file"
  }
  export -f process_gff_for_hub
  parallel -j8 $PARALLEL_OPTS process_gff_for_hub {} <"$NEW_ACCESSIONS_FILE" || true
else
  ./processGffFiles.sh
fi

log "Loading and text indexing NCBI GFF tracks..."
if [ "$MODE" = "new" ]; then
  add_track_for_hub() {
    local accession="$1"
    local gff_file
    gff_file=$(echo bgz/"${accession}"_*.gff.gz)
    if [ ! -f "$gff_file" ]; then
      return
    fi

    local hub_dir
    hub_dir=$(accession_to_hub_dir "$accession")

    if ! jbrowse add-track --force "$gff_file" --out "$hub_dir" --load copy --indexFile "${gff_file}".csi --trackId "${accession}-ncbiGff" --name "NCBI RefSeq - RefSeq All (GFF)" --category "Genes and Gene Predictions" >/dev/null; then
      echo "Warning: add-track failed for $accession" >&2
      return
    fi

    if [ -d "$hub_dir/trix" ]; then
      add_trix_adapter "$accession" "$hub_dir/config.json"
    else
      echo "Running jbrowse text-index for $accession"
      jbrowse text-index --force --out "$hub_dir" --tracks "${accession}-ncbiGff" --attributes Name,ID,Note || echo "Warning: text-index failed for $accession" >&2
    fi
  }
  export -f add_track_for_hub
  parallel -j16 $PARALLEL_OPTS add_track_for_hub {} <"$NEW_ACCESSIONS_FILE" || true
else
  ./addNcbiGffAndTextIndex.sh
fi

# --- Phase 5: Extensions and chain tracks ---

log "Adding GenArk extensions (special tracks)..."
node src/makeGenArkExtensions.ts

log "Processing liftOver chain files and creating PIFs..."
if [ "$MODE" = "new" ]; then
  parallel $PARALLEL_OPTS './createChainTrackPifs.sh {}' <"$NEW_HUBS_FILE" || true
else
  while IFS= read -r meta; do
    [[ ! -f "$(dirname "$meta")/liftOver/.checked" ]] && echo "$meta"
  done <"$ALL_META_FILE" | parallel $PARALLEL_OPTS './createChainTrackPifs.sh {}' || true
fi

log "Adding chain tracks to configs..."
if [ "$MODE" = "new" ]; then
  node src/createChainTracksBatch.ts <"$NEW_HUBS_FILE"
else
  node src/createChainTracksBatch.ts <"$ALL_META_FILE"
fi

# --- Phase 6: Wiki images and finishing ---

log "Fetching taxon-level images (Wikidata + Wikipedia)..."
node src/getTaxonImages.ts

log "Copying taxon images to accession directories..."
node src/copyTaxonImages.ts

log "Calculating gff file hashes..."
./getFileListing.sh

log "Enhancing configs with plugins and hierarchical settings..."
if [ "$MODE" = "new" ]; then
  sed 's/meta.json/config.json/' "$NEW_HUBS_FILE" | node src/enhanceConfigsBatch.ts
else
  sed 's/meta.json/config.json/' "$ALL_META_FILE" | node src/enhanceConfigsBatch.ts
fi

# --- Phase 7: Mouse strain assemblies ---
# Mouse strain hubs change very rarely; skip unless the stamp is older than 30 days.

MOUSE_STRAIN_STAMP=".mouse_strain_stamp"
MOUSE_STRAIN_MAX_AGE_DAYS=30
run_mouse_strains=true

if [ -z "${REPROCESS:-}" ] && [ -f "$MOUSE_STRAIN_STAMP" ]; then
  age_seconds=$(($(date +%s) - $(stat -c %Y "$MOUSE_STRAIN_STAMP")))
  age_days=$((age_seconds / 86400))
  if [ "$age_days" -lt "$MOUSE_STRAIN_MAX_AGE_DAYS" ]; then
    log "Skipping mouse strain processing (last run ${age_days} day(s) ago, threshold: ${MOUSE_STRAIN_MAX_AGE_DAYS} days)"
    run_mouse_strains=false
  fi
fi

if [ "$run_mouse_strains" = true ]; then
  log "Processing UCSC mouse strain assemblies..."
  node src/processMouseStrainsHub.ts

  log "Adding mm10 synteny tracks to mouse strain configs..."
  node src/createMouseStrainsChainTracks.ts

  log "Generating Ensembl mouse strains portal..."
  node src/processEnsemblMouseStrainsPortal.ts

  log "Adding mm39 synteny/MAF/VCF tracks to Ensembl mouse strain configs..."
  node src/createEnsemblMouseChainTracks.ts

  touch "$MOUSE_STRAIN_STAMP"
fi

# --- Done ---

if [ "$MODE" = "new" ]; then
  log "Done processing $NEW_HUB_COUNT new hub(s)"
else
  log "Done processing all hubs"
fi
