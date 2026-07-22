#!/bin/bash

#
# enhanceConfigs.sh
#
# Enhances JBrowse config files by adding plugins and hierarchical configuration.
# Takes built directories, not download directories; with no arguments, every
# assembly under UCSC_BUILT_DIR is processed.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

process_assembly() {
  local assembly_dir=$1
  local config_path="$assembly_dir/config.json"

  if [ ! -f "$config_path" ]; then
    echo "Warning: config.json not found for $(basename "$assembly_dir"), skipping..."
  else
    node src/enhanceConfig.ts "$config_path"
  fi
}
export -f process_assembly

if [ $# -gt 0 ]; then
  run_for_assemblies process_assembly "$@"
else
  run_for_assemblies process_assembly "$UCSC_BUILT_DIR"/*
fi
