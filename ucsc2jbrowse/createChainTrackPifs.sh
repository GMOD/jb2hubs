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
#   outdir:            The root output directory for all assemblies. Defaults to UCSC_BUILT_DIR.
#   liftover_base_url: Optional. Custom base URL for liftOver files. Overrides the default goldenPath URL.
#
# `jbrowse make-pif` emits the no-CIGAR coarse tier (uppercase T/Q rows) by
# default since the coarse-tier release, so whole-genome synteny views auto-
# switch to it. Regenerating existing PIFs to gain the coarse tier needs that
# newer @jbrowse/cli on PATH plus a force pass: the default run skips assemblies
# that already have outputs. Set REPROCESS=true to force a full rebuild (clears
# the .checked stamp and ignores existing pif/csi).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Configuration (overridable via environment) ---
UCSC_CHAINS_DIR="${UCSC_CHAINS_DIR:-/mnt/sdb/cdiesh/chains}"
UCSC_PIFS_DIR="${UCSC_PIFS_DIR:-/mnt/sdb/cdiesh/pifs}"

source "$SCRIPT_DIR/../chainpif.sh"

# --- Global Variables ---
declare -g CONFIG_DIR SOURCE ASSEMBLY OUTDIR LIFTOVER_BASE_URL

# Prints usage information and exits.
usage() {
  echo "Usage: $0 <source> <assembly> [outdir] [liftover_base_url]"
  echo "  source:            'liftOver' or 'vs'"
  echo "  assembly:          The assembly name (e.g., hg38)"
  echo "  outdir:            Root output directory. Defaults to UCSC_BUILT_DIR"
  echo "  liftover_base_url: Optional. Custom base URL for liftOver files."
  exit 1
}

# Validates and sets up configuration
setup_config() {
  SOURCE=${1:-}
  ASSEMBLY=${2:-}
  OUTDIR=${3:-"${UCSC_BUILT_DIR}"}
  LIFTOVER_BASE_URL=${4:-}

  if [[ -z "$SOURCE" || -z "$ASSEMBLY" ]]; then
    usage
  fi

  if [[ "$SOURCE" != "liftOver" && "$SOURCE" != "vs" ]]; then
    log_error "Invalid source '$SOURCE'. Must be 'liftOver' or 'vs'."
  fi

  # CHAINS_DIR and PIFS_DIR are read by the chainpif.sh helpers.
  CHAINS_DIR="$UCSC_CHAINS_DIR"
  PIFS_DIR="$UCSC_PIFS_DIR"
  CONFIG_DIR="$OUTDIR/$ASSEMBLY"

  mkdir -p "$CHAINS_DIR" "$PIFS_DIR" "$CONFIG_DIR"
}

# --- Source-specific Processing Functions ---

# Processes liftOver chain files
process_liftover() {
  local liftover_dir="$CONFIG_DIR/liftOver"
  mkdir -p "$liftover_dir"
  local stamp="$liftover_dir/.checked"

  if [[ -n "${REPROCESS:-}" ]]; then
    rm -f "$stamp"
  elif [[ -f "$stamp" ]]; then
    return 0
  fi

  local base_url
  if [[ -n "$LIFTOVER_BASE_URL" ]]; then
    base_url="$LIFTOVER_BASE_URL"
  else
    base_url="https://hgdownload.soe.ucsc.edu/goldenPath/$ASSEMBLY/liftOver/"
  fi

  # Get chain file URLs, excluding md5sum files
  local urls
  urls=$(extract_file_urls "$base_url" '\.chain\.gz$' | { grep -v md5sum || true; } | sed "s|^|$base_url|")

  if [[ -z "$urls" ]]; then
    log_info "No liftOver chain files found at $base_url, skipping"
    touch "$stamp"
    return 0
  fi

  echo "$urls" | while read -r url; do
    process_chain_file "$url" "$(basename "$url")" '.chain.gz' "$liftover_dir"
  done
  touch "$stamp"
}

# Processes vs chain files
process_vs() {
  local vs_dir="$CONFIG_DIR/vs"
  mkdir -p "$vs_dir"
  local stamp="$vs_dir/.checked"

  if [[ -n "${REPROCESS:-}" ]]; then
    rm -f "$stamp"
  elif [[ -f "$stamp" ]]; then
    return 0
  fi

  local base_url="https://hgdownload.soe.ucsc.edu/goldenPath/$ASSEMBLY"

  # Get 'vs*' subdirectories
  local subdirs
  subdirs=$(extract_file_urls "$base_url/" '^vs.*/$')

  if [[ -z "$subdirs" ]]; then
    log_info "No 'vs*' subdirectories found at $base_url, skipping"
    touch "$stamp"
    return 0
  fi

  echo "$subdirs" | while read -r subdir; do
    local subdir_url="$base_url/$subdir"

    # Get '*.all.chain.gz' files from the subdirectory
    local files
    files=$(extract_file_urls "$subdir_url/" '\.all\.chain\.gz$')

    echo "$files" | while read -r file; do
      [[ -n "$file" ]] || continue
      process_chain_file "$subdir_url/$file" "$file" '.all.chain.gz' "$vs_dir"
    done
  done
  touch "$stamp"
}

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

main() {
  setup_config "$@"
  process_chains
}

main "$@"
