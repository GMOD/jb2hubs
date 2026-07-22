#!/bin/bash

#
# addMetadata.sh
#
# Adds metadata from trackDb.sql to the JBrowse config.json for each assembly.
# Takes built directories, not download directories.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

process_assembly() {
  local assembly_dir=$1
  local config_file="$assembly_dir/config.json"
  local tracks_file="$assembly_dir/tracks.json"

  # Add metadata from the tracksDb.sql to the config.json
  if [ -f "$config_file" ] && [ -f "$tracks_file" ]; then
    node src/addMetadata.ts "$config_file" "$tracks_file"
  fi
}
export -f process_assembly

run_for_assemblies_lenient process_assembly "adding metadata" "$@"
