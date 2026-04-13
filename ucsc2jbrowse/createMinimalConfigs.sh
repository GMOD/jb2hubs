#!/bin/bash

# Script to create minimal versions of UCSC configs in their assembly directories
# Minimal configs include only: ncbiRefSeq, gencode, repeatMasker, clinvar, and gaps

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Use provided argument or default to UCSC_BUILT_DIR
RESULTS_DIR="${1:-$UCSC_BUILT_DIR}"

# Check if results directory exists
if [ ! -d "$RESULTS_DIR" ]; then
    log "Error: Results directory does not exist: $RESULTS_DIR"
    exit 1
fi

log "Creating minimal configs in assembly directories..."
log "Results directory: $RESULTS_DIR"

node "$SCRIPT_DIR/src/createMinimalConfig.ts" "$RESULTS_DIR"

log "Copying minimal configs to configs-minimal directory..."

# Create configs-minimal directory if it doesn't exist
MINIMAL_DIR="$SCRIPT_DIR/configs-minimal"
mkdir -p "$MINIMAL_DIR"

# Copy all minimal.json files to configs-minimal with assembly name
find "$RESULTS_DIR" -mindepth 2 -maxdepth 2 -name "minimal.json" | while read -r minimal_file; do
    assembly_name=$(basename "$(dirname "$minimal_file")")
    cp "$minimal_file" "$MINIMAL_DIR/${assembly_name}.json"
done

log "Done! Minimal configs created in each assembly directory and configs-minimal/"
