#!/bin/bash

# Script to generate phylogenetic trees for all categories
# This script loops through all JSON files in processedHubJson/ and generates
# corresponding Newick files in public/phylogeny/

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROCESSED_HUB_JSON_DIR="$SCRIPT_DIR/../processedHubJson"
OUTPUT_DIR="$SCRIPT_DIR/../public/phylogeny"
TAXONOMY_DIR="$SCRIPT_DIR"

echo "=== Generating phylogenetic trees for all categories ==="
echo "Input directory: $PROCESSED_HUB_JSON_DIR"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Counter for success/failure
SUCCESS_COUNT=0
FAILURE_COUNT=0
FAILED_CATEGORIES=""

# Loop through all JSON files in processedHubJson/
for json_file in "$PROCESSED_HUB_JSON_DIR"/*.json; do
    # Get the base name without path and extension
    filename=$(basename "$json_file")
    category="${filename%.json}"

    # Skip if no JSON files found
    if [ "$category" = "*" ]; then
        echo "No JSON files found in $PROCESSED_HUB_JSON_DIR"
        exit 1
    fi

    output_file="$OUTPUT_DIR/${category}.newick"

    echo "Processing: $category"
    echo "  Input: $json_file"
    echo "  Output: $output_file"

    # Run the phylogeny builder
    if python3 "$SCRIPT_DIR/build_phylogeny.py" \
        --input "$json_file" \
        --output "$output_file" \
        --taxonomy-dir "$TAXONOMY_DIR"; then
        echo "  ✓ Successfully generated $category.newick"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo "  ✗ Failed to generate $category.newick"
        FAILURE_COUNT=$((FAILURE_COUNT + 1))
        FAILED_CATEGORIES="$FAILED_CATEGORIES\n  - $category"
    fi

    echo ""
done

echo "=== Generation complete ==="
echo "Success: $SUCCESS_COUNT"
echo "Failure: $FAILURE_COUNT"

if [ $FAILURE_COUNT -gt 0 ]; then
    echo -e "Failed categories:$FAILED_CATEGORIES"
    exit 1
fi

echo "All phylogenies generated successfully!"
