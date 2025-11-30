#!/bin/bash

source "$(dirname "$0")/common.sh"

# Configuration
INPUT_FILE="processedHubJson/all.json"

# Script to process Wikipedia images for all species in parallel using GNU parallel
process_wiki_image() {
  local scientific_name="$1"
  local accession="$2"
  local hub_dir="$(accession_to_hub_dir "$accession")/"

  if [[ ! -f "$hub_dir/image.json" && ! -f "$hub_dir/image.json.notfound" && "$scientific_name" != "null" ]]; then
    echo "Fetching: $scientific_name ($accession)"
    node src/getWikiImage.ts "$scientific_name" "$accession"
    sleep 0.1
  fi
}

export -f process_wiki_image

jq -r '.[] | select(. != null) | select(.accession != null) | select(.scientificName != null) | "\(.scientificName)\t\(.accession)"' "$INPUT_FILE" |
  parallel $PARALLEL_OPTS -j 1 --colsep $'\t' "process_wiki_image {1} {2}"
