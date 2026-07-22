#!/bin/bash

#
# addOrigAssemblyToAllTrackNames.sh
#
# Prefixes track names with their originating assembly. Takes built directories,
# not download directories.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

# Each invocation only rewrites its own config.json, so there is no shared-write
# hazard and no need to serialize.
process_assembly() {
  local config="$1/config.json"
  if [ -f "$config" ]; then
    node src/addOrigAssemblyToTrackName.ts "$config"
  fi
}
export -f process_assembly

run_for_assemblies_lenient process_assembly "adding original assembly to track names" "$@"
