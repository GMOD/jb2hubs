#!/bin/bash

# Script to create minimal versions of UCSC configs in their assembly directories
# Minimal configs include only: ncbiRefSeq, gencode, repeatMasker, clinvar, and gaps

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/src"

# Set default for UCSC_RESULTS_DIR if not already set
: ${UCSC_RESULTS_DIR:=~/ucscResults}

# Use provided argument or default to UCSC_RESULTS_DIR
RESULTS_DIR="${1:-$UCSC_RESULTS_DIR}"

# Check if results directory exists
if [ ! -d "$RESULTS_DIR" ]; then
    echo "Error: Results directory does not exist: $RESULTS_DIR"
    exit 1
fi

echo "Creating minimal configs in assembly directories..."
echo "Results directory: $RESULTS_DIR"
echo "Output: <assembly>/minimal.json"
echo

# Run the TypeScript script using Node's built-in TypeScript support
node --experimental-strip-types "$SRC_DIR/createMinimalConfig.ts" "$RESULTS_DIR"

echo
echo "Copying minimal configs to configs-minimal directory..."

# Create configs-minimal directory if it doesn't exist
MINIMAL_DIR="$SCRIPT_DIR/configs-minimal"
mkdir -p "$MINIMAL_DIR"

# Copy all minimal.json files to configs-minimal with assembly name
find "$RESULTS_DIR" -mindepth 2 -maxdepth 2 -name "minimal.json" | while read -r minimal_file; do
    assembly_name=$(basename "$(dirname "$minimal_file")")
    cp "$minimal_file" "$MINIMAL_DIR/${assembly_name}.json"
done

echo
echo "Done! Minimal configs created:"
echo "  - In each assembly directory as minimal.json"
echo "  - In configs-minimal/ as <assembly>.json"
