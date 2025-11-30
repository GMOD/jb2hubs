#!/bin/bash

source "$(dirname "$0")/common.sh"

# Define function to add a GFF track to a JBrowse 2 assembly and create a text index.
add_track_and_text_index() {
  local gff_file_path="$1"
  local filename=$(basename "$gff_file_path")
  local accession=$(echo "$filename" | cut -d'_' -f1,2) # e.g., GCF_000896435.1
  local hub_dir="$(accession_to_hub_dir "$accession")/"

  jbrowse add-track --force "$gff_file_path" --out "$hub_dir" --load copy --indexFile "${gff_file_path}".csi --trackId "${accession}-ncbiGff" --name "NCBI RefSeq - RefSeq All (GFF)" --category "Genes and Gene Predictions"
  # Check if trix folder exists
  if [ -d "$hub_dir/trix" ] && [ -z "$REDOWNLOAD" ] && [ -z "$REPROCESS" ] && [ -z "$REPROCESS_TRIX" ]; then
    # Add JSON snippet to config.json using jq
    local config_file="$hub_dir/config.json"
    local temp_file=$(mktemp)

    jq --arg accession "$accession" '. + {
      "aggregateTextSearchAdapters": [
        {
          "type": "TrixTextSearchAdapter",
          "textSearchAdapterId": ($accession + "-index"),
          "ixFilePath": {
            "uri": ("trix/" + $accession + ".ix"),
            "locationType": "UriLocation"
          },
          "ixxFilePath": {
            "uri": ("trix/" + $accession + ".ixx"),
            "locationType": "UriLocation"
          },
          "metaFilePath": {
            "uri": ("trix/" + $accession + "_meta.json"),
            "locationType": "UriLocation"
          },
          "assemblyNames": [$accession]
        }
      ]
    }' "$config_file" >"$temp_file" && mv "$temp_file" "$config_file"
  else
    echo "Trix folder does not exist for $accession, running jbrowse text-index"

    jbrowse text-index --force --out "$hub_dir" --tracks "${accession}-ncbiGff" --attributes Name,ID,Note
  fi
}

# Export function for use with GNU Parallel
export -f add_track_and_text_index

find bgz -name "*.gz" | parallel -j16 $PARALLEL_OPTS add_track_and_text_index
