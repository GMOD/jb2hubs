#!/bin/bash
#
# createChainTrackPifs.sh
#
# Downloads an assembly's liftOver chains and converts them to PIF (Pairwise
# Indexed PAF) format. liftOver is the only source: ADR 0004 records why the raw
# `vs*` all.chain files are not built.
#
# Usage: ./createChainTrackPifs.sh <assembly> [outdir]
#   assembly: The assembly name (e.g., hg38).
#   outdir:   The root output directory for all assemblies. Defaults to UCSC_BUILT_DIR.
#
# `jbrowse make-pif` emits the no-CIGAR coarse tier (uppercase T/Q rows) by
# default since the coarse-tier release, so whole-genome synteny views auto-
# switch to it. The CLI is the repo's pinned one (JBROWSE_CLI), and a bump to it
# is picked up on the next run: the .cli stamps beside the PIFs record which
# build wrote them, so a version that differs is rebuilt without a force pass.
# Set REPROCESS=true to force a full rebuild anyway (clears the .checked stamp
# and ignores existing pif/csi).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Configuration (overridable via environment) ---
UCSC_CHAINS_DIR="${UCSC_CHAINS_DIR:-/mnt/sdb/cdiesh/chains}"
UCSC_PIFS_DIR="${UCSC_PIFS_DIR:-/mnt/sdb/cdiesh/pifs}"

source "$SCRIPT_DIR/../lib/chainpif.sh"

# --- Global Variables ---
declare -g CONFIG_DIR ASSEMBLY OUTDIR

# Prints usage information and exits.
usage() {
  echo "Usage: $0 <assembly> [outdir]"
  echo "  assembly: The assembly name (e.g., hg38)"
  echo "  outdir:   Root output directory. Defaults to UCSC_BUILT_DIR"
  exit 1
}

# Validates and sets up configuration
setup_config() {
  ASSEMBLY=${1:-}
  OUTDIR=${2:-"${UCSC_BUILT_DIR}"}

  if [[ -z "$ASSEMBLY" ]]; then
    usage
  fi

  # CHAINS_DIR and PIFS_DIR are read by the chainpif.sh helpers.
  CHAINS_DIR="$UCSC_CHAINS_DIR"
  PIFS_DIR="$UCSC_PIFS_DIR"
  CONFIG_DIR="$OUTDIR/$ASSEMBLY"

  mkdir -p "$CHAINS_DIR" "$PIFS_DIR" "$CONFIG_DIR"
}

# hs1 publishes seven of its liftOver chains under /gbdb only. Both listings
# feed one directory and one stamp: as two passes, the goldenPath pass stamped
# the directory and the gbdb pass then skipped it, so those seven were never
# rebuilt.
liftover_listing_urls() {
  echo "https://hgdownload.soe.ucsc.edu/goldenPath/$1/liftOver/"
  if [[ "$1" == hs1 ]]; then
    echo "https://hgdownload.soe.ucsc.edu/gbdb/hs1/liftOver/"
  fi
}

# Processes liftOver chain files
process_liftover() {
  local liftover_dir="$CONFIG_DIR/liftOver"
  mkdir -p "$liftover_dir"
  local stamp="$liftover_dir/.checked"

  if [[ -n "${REPROCESS:-}" ]]; then
    rm -f "$stamp"
  elif liftover_stamp_current "$stamp"; then
    return 0
  fi

  local urls
  urls=$(liftover_listing_urls "$ASSEMBLY" | while IFS= read -r base_url; do
    extract_file_urls "$base_url" '\.chain\.gz$' | { grep -v md5sum || true; } | sed "s|^|$base_url|" || exit 1
  done | awk -F/ '!seen[$NF]++')

  if [[ -z "$urls" ]]; then
    log_info "No liftOver chain files found for $ASSEMBLY, skipping"
    write_pif_stamp "$stamp"
    return 0
  fi

  echo "$urls" | while read -r url; do
    process_chain_file "$url" "$(basename "$url")" '.chain.gz' "$liftover_dir"
  done
  write_pif_stamp "$stamp"
}

main() {
  setup_config "$@"
  process_liftover
}

main "$@"
