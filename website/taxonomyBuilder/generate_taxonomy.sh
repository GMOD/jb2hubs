#!/bin/bash

# Builds public/taxonomy/<category>.newick for each processedHubJson/<category>.json
# in one build_taxonomy.py process, which reads the 477MB taxdump once.

set -e # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROCESSED_HUB_JSON_DIR="$SCRIPT_DIR/../processedHubJson"
OUTPUT_DIR="$SCRIPT_DIR/../public/taxonomy"
TAXONOMY_DIR="$SCRIPT_DIR"

echo "=== Generating taxonomy trees for all categories ==="
echo "Input directory: $PROCESSED_HUB_JSON_DIR"
echo "Output directory: $OUTPUT_DIR"
echo ""

mkdir -p "$OUTPUT_DIR"

# nullglob, so an empty directory yields no iterations rather than one iteration
# over the literal `*.json` -- which is the same shape as the unset nullglob that
# put `Gff3TabixAdapter` on a literal `*.gff.gz` into cb1's and hgFixed's configs.
shopt -s nullglob

ARGS=()
CATEGORIES=()
# ucsc.json is the UCSC genome list, not a GenArk category, and nothing renders
# a tree of it.
for json_file in "$PROCESSED_HUB_JSON_DIR"/*.json; do
  filename=$(basename "$json_file")
  category="${filename%.json}"
  if [ "$category" = ucsc ]; then
    continue
  fi
  CATEGORIES+=("$category")
  ARGS+=(--input "$json_file" --output "$OUTPUT_DIR/${category}.newick")
done

if [ "${#CATEGORIES[@]}" -eq 0 ]; then
  echo "No JSON files found in $PROCESSED_HUB_JSON_DIR"
  exit 1
fi

echo "Building ${#CATEGORIES[@]} categories: ${CATEGORIES[*]}"
echo ""

"$SCRIPT_DIR/fetchTaxdump.sh"
python3 "$SCRIPT_DIR/build_taxonomy.py" --taxonomy-dir "$TAXONOMY_DIR" "${ARGS[@]}"

echo ""
echo "All phylogenies generated successfully!"
