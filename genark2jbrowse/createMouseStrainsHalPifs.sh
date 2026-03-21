#!/bin/bash
#
# createMouseStrainsHalPifs.sh
#
# Extracts pairwise alignments between each mouse strain and mm10 from the
# UCSC mouseStrains Cactus HAL file, then converts to PIF (Pairwise Indexed PAF)
# format for use as SyntenyTrack in JBrowse 2.
#
# Prerequisites: hal2paf, jbrowse (CLI), pigz
#
# Usage: ./createMouseStrainsHalPifs.sh
#
# After running this script, run:
#   node src/createMouseStrainsChainTracks.ts
# to add the SyntenyTrack entries to each strain's config.json.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

HAL_URL="https://hgdownload.soe.ucsc.edu/hubs/mouseStrains/mouseStrains_1509.hal"
HAL_CACHE_DIR="${MOUSE_STRAINS_HAL_DIR:-/mnt/sdb/cdiesh/mouseStrains}"
HAL_FILE="$HAL_CACHE_DIR/mouseStrains_1509.hal"
TARGET_GENOME="mm10"

if ! command -v hal2paf &>/dev/null; then
  echo "Error: hal2paf not found. Install hal-tools (https://github.com/ComparativeGenomicsToolkit/hal)" >&2
  exit 1
fi

mkdir -p "$HAL_CACHE_DIR"

# Download the HAL file once (37 GB)
if [ ! -f "$HAL_FILE" ]; then
  log "Downloading HAL file (37 GB)..."
  wget -q --show-progress -O "$HAL_FILE.tmp" "$HAL_URL"
  mv "$HAL_FILE.tmp" "$HAL_FILE"
  log "HAL file downloaded to $HAL_FILE"
else
  log "HAL file already present at $HAL_FILE"
fi

# For each mouse strain directory, extract pairwise alignment to mm10
for config_dir in hubs/mouseStrains/*/; do
  genome_name=$(basename "$config_dir")
  liftover_dir="$config_dir/liftOver"
  pif_file="$liftover_dir/${genome_name}Tomm10.pif.gz"

  if [ -f "$pif_file" ] && [ -f "$pif_file.csi" ]; then
    log "$genome_name: PIF already exists, skipping"
    continue
  fi

  log "$genome_name: extracting PAF from HAL..."
  mkdir -p "$liftover_dir"

  paf_tmp=$(mktemp --suffix=.paf)

  if ! hal2paf "$HAL_FILE" "$genome_name" "$TARGET_GENOME" >"$paf_tmp"; then
    log "Warning: hal2paf failed for $genome_name, skipping"
    rm -f "$paf_tmp"
    continue
  fi

  log "$genome_name: creating PIF..."
  if ! jbrowse make-pif "$paf_tmp" --csi --out "$pif_file"; then
    log "Warning: make-pif failed for $genome_name, skipping"
    rm -f "$paf_tmp" "$pif_file" "$pif_file.csi"
    continue
  fi

  rm -f "$paf_tmp"
  log "$genome_name: created $pif_file"
done

log "Done creating mouse strain PIF files"
