#!/bin/bash
#
# createChainTrackPifs.sh
#
# Downloads chain files from GenArk hubs and converts them to PIF (Pairwise Indexed PAF) format.
# This script processes liftOver chain files from UCSC GenArk assembly hubs.
#
# Usage: ./createChainTrackPifs.sh <meta_json_path>
#   meta_json_path: Path to the meta.json file for the assembly (e.g., hubs/GCA/031/761/385/GCA_031761385.1/meta.json)

set -euo pipefail

# --- Configuration ---
# These can be overridden via environment variables
GENARK_CHAINS_BASE="${GENARK_CHAINS_BASE:-/mnt/sdb/cdiesh/genark_chains}"
GENARK_PIFS_DIR="${GENARK_PIFS_DIR:-/mnt/sdb/cdiesh/genark_pifs}"

# --- Global Variables ---
declare -g CHAINS_DIR PIFS_DIR META_PATH ACCESSION HUB_URL CONFIG_DIR

# --- Logging Functions ---

# Logs an info message with timestamp
log_info() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $*"
}

# Logs an error message and exits
log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
  exit 1
}

# --- Utility Functions ---

# Prints usage information and exits.
usage() {
  echo "Usage: $0 <meta_json_path>"
  echo "  meta_json_path: Path to the meta.json file for the assembly"
  exit 1
}

# Validates and sets up configuration
setup_config() {
  META_PATH=${1:-}

  if [[ -z "$META_PATH" ]]; then
    usage
  fi

  if [[ ! -f "$META_PATH" ]]; then
    log_error "meta.json file not found: $META_PATH"
  fi

  # Extract accession and hub URL from meta.json
  local meta_fields
  meta_fields=$(jq -r '[.accession, .hubFileLocation] | @tsv' "$META_PATH")
  ACCESSION=$(echo "$meta_fields" | cut -f1)
  HUB_URL=$(echo "$meta_fields" | cut -f2 | sed 's|/hub.txt$||')

  if [[ -z "$ACCESSION" || "$ACCESSION" == "null" ]]; then
    log_error "Could not extract accession from $META_PATH"
  fi

  if [[ -z "$HUB_URL" || "$HUB_URL" == "null" ]]; then
    log_error "Could not extract hubFileLocation from $META_PATH"
  fi

  # Define directories
  CHAINS_DIR="$GENARK_CHAINS_BASE/$ACCESSION"
  PIFS_DIR="$GENARK_PIFS_DIR"
  CONFIG_DIR=$(dirname "$META_PATH")

  # Create directories if they don't exist
  mkdir -p "$CHAINS_DIR" "$PIFS_DIR" "$CONFIG_DIR/liftOver"
}

# Extracts file URLs from HTML directory listing
# $1: URL to fetch
# $2: grep pattern for files
extract_file_urls() {
  local url="$1"
  local pattern="$2"
  wget -q -O - "$url" 2>/dev/null | grep -oP 'href="\K[^"]+' | grep "$pattern" || true
}

# Generates file paths for processing
# $1: filename
generate_file_paths() {
  local filename="$1"
  local filename_no_ext
  filename_no_ext="${filename%.over.chain.gz}"

  echo "$CHAINS_DIR/$filename"             # chain_path
  echo "$PIFS_DIR/$filename_no_ext.pif.gz" # pif_path
}

# Downloads a file if it doesn't already exist.
# $1: URL
# $2: Output path
download_file() {
  local url="$1"
  local output_path="$2"
  if [ ! -f "$output_path" ]; then
    log_info "Downloading $(basename "$output_path")..."
    # Add a small delay to avoid overwhelming the server
    sleep 0.5
    # Use a temporary file to ensure atomic downloads
    # shellcheck disable=SC2015
    wget -q -O "$output_path.tmp" "$url" && mv "$output_path.tmp" "$output_path" || {
      rm -f "$output_path.tmp"
      log_error "Failed to download $url"
    }
  else
    log_info "File $(basename "$output_path") already exists, skipping download"
  fi
}

# Converts a chain file to a PIF file.
# $1: Path to the chain file (.chain.gz)
# $2: Path to the output PIF file (.pif.gz)
create_pif() {
  local chain_path="$1"
  local pif_path="$2"
  if [ ! -f "$pif_path" ] || [ ! -f "$pif_path.csi" ]; then
    log_info "Creating PIF file for $(basename "$chain_path")..."
    local paf_path
    paf_path=$(mktemp) || log_error "Failed to create temporary file"

    if ! pigz -dc "$chain_path" | chain2paf --input /dev/stdin >"$paf_path"; then
      rm -f "$paf_path"
      log_error "Failed to convert chain to PAF for $(basename "$chain_path")"
    fi

    if ! jbrowse make-pif "$paf_path" --csi --out "$pif_path"; then
      rm -f "$paf_path"
      log_error "Failed to create PIF for $(basename "$chain_path")"
    fi

    rm "$paf_path"
  fi
}

# Copies PIF files to destination directory
# $1: source PIF path
# $2: destination directory
copy_pif_files() {
  local pif_path="$1"
  local dest_dir="$2"
  cp "$pif_path" "$dest_dir/" || log_error "Failed to copy $pif_path"
  cp "$pif_path.csi" "$dest_dir/" || log_error "Failed to copy $pif_path.csi"
}

# Processes a single chain file through the complete pipeline
# $1: file URL
# $2: filename
# $3: destination directory for PIF files
process_chain_file() {
  local file_url="$1"
  local filename="$2"
  local dest_dir="$3"
  local paths
  readarray -t paths < <(generate_file_paths "$filename")
  local chain_path="${paths[0]}"
  local pif_path="${paths[1]}"
  local pif_filename
  pif_filename=$(basename "$pif_path")

  if [[ -f "$dest_dir/$pif_filename" && -f "$dest_dir/$pif_filename.csi" ]]; then
    log_info "PIF file $pif_filename already exists, skipping"
    return
  fi

  download_file "$file_url" "$chain_path"
  create_pif "$chain_path" "$pif_path"
  copy_pif_files "$pif_path" "$dest_dir"
}

# Processes liftOver chain files
process_liftover() {
  local liftover_dir="$CONFIG_DIR/liftOver"
  mkdir -p "$liftover_dir"
  local stamp="$liftover_dir/.checked"

  if [[ -f "$stamp" ]]; then
    return 0
  fi

  local base_url="$HUB_URL/liftOver/"

  # Get chain file URLs, excluding md5sum files
  local urls
  urls=$(extract_file_urls "$base_url" '\.over\.chain\.gz$' | { grep -v md5sum || true; } | sed "s|^|$base_url|")

  if [[ -z "$urls" ]]; then
    # No liftOver files found, which is normal for many assemblies
    touch "$stamp"
    return 0
  fi

  echo "$urls" | while read -r url; do
    local filename
    filename=$(basename "$url")
    process_chain_file "$url" "$filename" "$liftover_dir"
  done
  touch "$stamp"
}

# --- Main Script ---

main() {
  setup_config "$@"
  process_liftover
}

# Run main function with all arguments
main "$@"
