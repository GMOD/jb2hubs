#!/bin/bash
#
# make.sh
#
# Builds the cross-species ortholog tables that drive gene-level synteny
# comparisons on the website. Scoped to taxon pairs that already have a synteny
# track, so every ortholog mapping has an alignment to load alongside it.
#
# Steps:
#   1. Refresh website/src/syntenyTracks.json (provides assembly -> taxonId and
#      the synteny pairs that bound the work).
#   2. Download the NCBI Gene source tables (reproducible, cached).
#   3. Join into per-taxon-pair symbol TSVs under website/public/orthologs/
#      plus website/src/orthologManifest.json.
#
# Usage:
#   ./make.sh                  # build, reusing cached downloads
#   ./make.sh --skip-synteny   # assume syntenyTracks.json is already fresh
#   REPROCESS=true ./make.sh   # force re-download of NCBI tables

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"
cd "$SCRIPT_DIR/.."

SKIP_SYNTENY=false
for arg in "$@"; do
  case $arg in
  --skip-synteny) SKIP_SYNTENY=true ;;
  *)
    echo "Unknown option: $arg"
    exit 1
    ;;
  esac
done

if [ "$SKIP_SYNTENY" = false ]; then
  log "Refreshing synteny tracks (assembly -> taxonId map + synteny pairs)..."
  node extractSyntenyTracks.ts
fi

log "Downloading NCBI ortholog source tables..."
"$SCRIPT_DIR/downloadOrthologData.sh"

log "Building per-taxon-pair ortholog tables..."
node orthologs/src/buildOrthologTable.ts

log "Ortholog tables built."
