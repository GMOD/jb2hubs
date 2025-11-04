#!/bin/bash

#
# enhanceConfigs.sh
#
# Enhances all JBrowse config files by adding plugins and hierarchical configuration.
#

set -euo pipefail

# Set NODE_OPTIONS to suppress experimental warnings
export NODE_OPTIONS="--no-warnings=ExperimentalWarning"

if [ -t 1 ]; then
  PARALLEL_OPTS="--bar"
else
  PARALLEL_OPTS=""
fi
export PARALLEL_OPTS

# --- Functions ---

# Processes a single assembly's config.json
# $1: The path to config.json
process_config() {
  local config_path="$1"

  if [ ! -f "$config_path" ]; then
    echo "Warning: config.json not found at $config_path, skipping..."
    return
  fi

  node src/enhanceConfig.ts "$config_path"
}

export -f process_config

# --- Main Script ---

echo "Enhancing GenArk config files with plugins and hierarchical configuration..."

# Find all config.json files in the hubs directory and process them in parallel
# fd -t f 'config.json' hubs | parallel $PARALLEL_OPTS process_config {}

echo "Config enhancement complete"
