#!/bin/bash

#
# enhanceConfigs.sh
#
# Enhances all JBrowse config files by adding plugins and hierarchical configuration.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"
cd "$(dirname "$0")"

# --- Main Script ---

# Find all config.json files in the hubs directory and enhance them
fd '^config\.json$' hubs | parallel $PARALLEL_OPTS node src/enhanceConfig.ts {}
