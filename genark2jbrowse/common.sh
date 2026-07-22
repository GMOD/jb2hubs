#!/bin/bash
#
# common.sh
#
# Shared configuration for genark2jbrowse scripts.
# Source this file at the top of other scripts: source "$(dirname "$0")/common.sh"
#

# Source the root common.sh for shared utilities
source "$(dirname "$0")/../common.sh"

# Converts an accession (e.g., GCF_000896435.1) to its hub directory path
# Usage: hub_dir=$(accession_to_hub_dir "GCF_000896435.1")
# Returns: hubs/GCF/000/896/435/GCF_000896435.1
accession_to_hub_dir() {
  local accession="$1"
  local prefix=${accession%%_*}
  local number=${accession#*_}
  local base_number=${number%%.*}
  local first_part=${base_number:0:3}
  local second_part=${base_number:3:3}
  local third_part=${base_number:6:3}
  echo "hubs/$prefix/$first_part/$second_part/$third_part/$accession"
}
export -f accession_to_hub_dir

# Lists the files in a directory that belong to a run's scope: every *.gz under
# the directory, or -- when a scope file listing accessions (one per line) is
# given -- only the files for those accessions. Shared by the download, process
# and load stages, which all take the same optional scope-file argument.
# Usage: list_scoped_gz <dir> [scope_file]
list_scoped_gz() {
  local dir="$1" scope_file="${2:-}"
  if [ -z "$scope_file" ]; then
    find "$dir" -name "*.gz"
  else
    while IFS= read -r acc; do
      [ -n "$acc" ] || continue
      for f in "$dir/$acc"_*.gz; do
        if [ -f "$f" ]; then
          echo "$f"
        fi
      done
    done <"$scope_file"
  fi
}
export -f list_scoped_gz

# Adds the trix text search adapter entry to config.json via jq
# Usage: add_trix_adapter <accession> <config_file>
add_trix_adapter() {
  local accession="$1"
  local config_file="$2"
  local temp_file
  temp_file=$(mktemp)
  jq --arg accession "$accession" '. + {
    "aggregateTextSearchAdapters": [{
      "type": "TrixTextSearchAdapter",
      "textSearchAdapterId": ($accession + "-index"),
      "ixFilePath": {"uri": ("trix/" + $accession + ".ix"), "locationType": "UriLocation"},
      "ixxFilePath": {"uri": ("trix/" + $accession + ".ixx"), "locationType": "UriLocation"},
      "metaFilePath": {"uri": ("trix/" + $accession + "_meta.json"), "locationType": "UriLocation"},
      "assemblyNames": [$accession]
    }]
  }' "$config_file" >"$temp_file" && mv "$temp_file" "$config_file"
}
export -f add_trix_adapter
