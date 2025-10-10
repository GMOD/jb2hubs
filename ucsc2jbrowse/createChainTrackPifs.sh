#!/bin/bash
#
# createChainTrackPifs.sh
#
# Downloads chain files and converts them to PIF (Pairwise Indexed PAF) format.
# This script can handle two different sources for chain files: 'liftOver' and 'vs'.
#
# Usage: ./createChainTrackPifs.sh <source> <assembly> [outdir] [liftover_base_url]
#   source:            'liftOver' or 'vs'. This determines the URL and directory structure.
#   assembly:          The assembly name (e.g., hg38).
#   outdir:            The root output directory for all assemblies. Defaults to UCSC_RESULTS_DIR or ~/ucscResults.
#   liftover_base_url: Optional. Custom base URL for liftOver files. Overrides the default goldenPath URL.

set -euo pipefail

# --- Global Variables ---
declare -g CHAINS_DIR PIFS_DIR CONFIG_DIR SOURCE ASSEMBLY OUTDIR LIFTOVER_BASE_URL

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
  echo "Usage: $0 <source> <assembly> [outdir] [liftover_base_url]"
  echo "  source:            'liftOver' or 'vs'"
  echo "  assembly:          The assembly name (e.g., hg38)"
  echo "  outdir:            Root output directory. Defaults to UCSC_RESULTS_DIR or ~/ucscResults"
  echo "  liftover_base_url: Optional. Custom base URL for liftOver files."
  exit 1
}

# Validates and sets up configuration
setup_config() {
  SOURCE=${1:-}
  ASSEMBLY=${2:-}
  OUTDIR=${3:-"${UCSC_RESULTS_DIR:-~/ucscResults}"}
  LIFTOVER_BASE_URL=${4:-}

  if [[ -z "$SOURCE" || -z "$ASSEMBLY" ]]; then
    usage
  fi

  if [[ "$SOURCE" != "liftOver" && "$SOURCE" != "vs" ]]; then
    log_error "Invalid source '$SOURCE'. Must be 'liftOver' or 'vs'."
  fi

  # Define directories
  CHAINS_DIR="/mnt/sdb/cdiesh/chains"
  PIFS_DIR="/mnt/sdb/cdiesh/pifs"
  CONFIG_DIR="$OUTDIR/$ASSEMBLY"

  # log_info "Setting up directories for $SOURCE processing of $ASSEMBLY"
  mkdir -p "$CHAINS_DIR" "$PIFS_DIR" "$CONFIG_DIR"
}

# Extracts file URLs from HTML directory listing
# $1: URL to fetch
# $2: grep pattern for files
extract_file_urls() {
  local url="$1"
  local pattern="$2"
  wget -q -O - "$url" | grep -o 'href="[^"]*"' | sed 's/href="//' | sed 's/"//' | grep "$pattern"
}

# Generates file paths for processing
# $1: filename
# $2: file extension to remove (e.g., ".chain.gz" or ".all.chain.gz")
generate_file_paths() {
  local filename="$1"
  local ext_to_remove="$2"
  local filename_no_ext
  filename_no_ext=$(echo "$filename" | sed "s/$ext_to_remove//")

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
    # Use a temporary file to ensure atomic downloads
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
  if [ ! -f "$pif_path" ]; then
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
# $1: file URL or path
# $2: filename
# $3: file extension to remove
# $4: destination directory for PIF files
process_chain_file() {
  local file_url="$1"
  local filename="$2"
  local ext_to_remove="$3"
  local dest_dir="$4"
  local paths
  readarray -t paths < <(generate_file_paths "$filename" "$ext_to_remove")
  local chain_path="${paths[0]}"
  local pif_path="${paths[1]}"
  local pif_filename
  pif_filename=$(basename "$pif_path")

  if [[ -f "$dest_dir/$pif_filename" && -f "$dest_dir/$pif_filename.csi" ]]; then
    # log_info "PIF file $pif_filename and its index already exist in destination, skipping"
    return
  fi

  download_file "$file_url" "$chain_path"
  create_pif "$chain_path" "$pif_path"
  copy_pif_files "$pif_path" "$dest_dir"
}

# --- Source-specific Processing Functions ---

# Processes liftOver chain files
process_liftover() {
  local liftover_dir="$CONFIG_DIR/liftOver"
  mkdir -p "$liftover_dir"

  local base_url
  if [[ -n "$LIFTOVER_BASE_URL" ]]; then
    base_url="$LIFTOVER_BASE_URL"
  else
    base_url="https://hgdownload.soe.ucsc.edu/goldenPath/$ASSEMBLY/liftOver/"
  fi
  # log_info "Processing liftOver chains for $ASSEMBLY from $base_url"

  # Get chain file URLs, excluding md5sum files
  local urls
  urls=$(extract_file_urls "$base_url" '\.chain\.gz$' | grep -v md5sum | sed "s|^|$base_url|")

  if [[ -z "$urls" ]]; then
    log_error "No chain files found at $base_url"
  fi

  echo "$urls" | while read -r url; do
    local filename
    filename=$(basename "$url")
    process_chain_file "$url" "$filename" '\.chain\.gz' "$liftover_dir"
  done
}

# Processes vs chain files
process_vs() {
  local vs_dir="$CONFIG_DIR/vs"
  mkdir -p "$vs_dir"

  local base_url="https://hgdownload.soe.ucsc.edu/goldenPath/$ASSEMBLY"
  # log_info "Processing vs chains for $ASSEMBLY from $base_url"

  # Get 'vs*' subdirectories
  local subdirs
  subdirs=$(extract_file_urls "$base_url/" '^vs.*/$')

  if [[ -z "$subdirs" ]]; then
    log_error "No 'vs*' subdirectories found at $base_url"
  fi

  echo "$subdirs" | while read -r subdir; do
    local subdir_url="$base_url/$subdir"
    # log_info "Processing subdirectory: $subdir"

    # Get '*.all.chain.gz' files from the subdirectory
    local files
    files=$(extract_file_urls "$subdir_url/" '\.all\.chain\.gz$')

    echo "$files" | while read -r file; do
      [[ -n "$file" ]] || continue
      local file_url="$subdir_url/$file"
      process_chain_file "$file_url" "$file" '\.all\.chain\.gz' "$vs_dir"
    done
  done
}

# --- Main Processing Function ---

# Main processing dispatcher
process_chains() {
  case "$SOURCE" in
  liftOver)
    process_liftover
    ;;
  vs)
    process_vs
    ;;
  *)
    log_error "Invalid source '$SOURCE'. Must be 'liftOver' or 'vs'."
    ;;
  esac
}

# --- Main Script ---

main() {
  setup_config "$@"
  process_chains
}

# Run main function with all arguments
main "$@"
