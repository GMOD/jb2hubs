#!/bin/bash
#
# createChainTrackPifs.sh
#
# Downloads liftOver chain files from a GenArk assembly hub and converts them to
# PIF (Pairwise Indexed PAF) format.
#
# Usage: ./createChainTrackPifs.sh <meta_json_path>
#   meta_json_path: Path to the meta.json file for the assembly (e.g. hubs/GCA/031/761/385/GCA_031761385.1/meta.json)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Configuration (overridable via environment) ---
GENARK_CHAINS_BASE="${GENARK_CHAINS_BASE:-/mnt/sdb/cdiesh/genark_chains}"
GENARK_PIFS_DIR="${GENARK_PIFS_DIR:-/mnt/sdb/cdiesh/genark_pifs}"

# Be polite to the hub server between downloads.
export CHAINPIF_DOWNLOAD_DELAY=0.5
source "$SCRIPT_DIR/../chainpif.sh"

usage() {
  echo "Usage: $0 <meta_json_path>"
  echo "  meta_json_path: Path to the meta.json file for the assembly"
  exit 1
}

main() {
  local meta_path=${1:-}
  if [[ -z "$meta_path" ]]; then
    usage
  fi
  if [[ ! -f "$meta_path" ]]; then
    log_error "meta.json file not found: $meta_path"
  fi

  # Extract accession and hub URL from meta.json
  local meta_fields accession hub_url
  meta_fields=$(jq -r '[.accession, .hubFileLocation] | @tsv' "$meta_path")
  accession=$(echo "$meta_fields" | cut -f1)
  hub_url=$(echo "$meta_fields" | cut -f2 | sed 's|/hub.txt$||')

  if [[ -z "$accession" || "$accession" == "null" ]]; then
    log_error "Could not extract accession from $meta_path"
  fi
  if [[ -z "$hub_url" || "$hub_url" == "null" ]]; then
    log_error "Could not extract hubFileLocation from $meta_path"
  fi

  # CHAINS_DIR and PIFS_DIR are read by the chainpif.sh helpers.
  CHAINS_DIR="$GENARK_CHAINS_BASE/$accession"
  PIFS_DIR="$GENARK_PIFS_DIR"
  local config_dir liftover_dir stamp
  config_dir=$(dirname "$meta_path")
  liftover_dir="$config_dir/liftOver"
  stamp="$liftover_dir/.checked"
  mkdir -p "$CHAINS_DIR" "$PIFS_DIR" "$liftover_dir"

  if [[ -f "$stamp" ]]; then
    return 0
  fi

  # Get chain file URLs, excluding md5sum files
  local base_url urls
  base_url="$hub_url/liftOver/"
  urls=$(extract_file_urls "$base_url" '\.over\.chain\.gz$' | { grep -v md5sum || true; } | sed "s|^|$base_url|")

  if [[ -n "$urls" ]]; then
    echo "$urls" | while read -r url; do
      process_chain_file "$url" "$(basename "$url")" '.over.chain.gz' "$liftover_dir"
    done
  fi
  touch "$stamp"
}

main "$@"
