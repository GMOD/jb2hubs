#!/bin/bash

#
# createAssemblies.sh
#
# Creates the initial JBrowse configuration file for each assembly.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

process_assembly() {
  # shellcheck disable=SC2034 # assembly_paths sets all three; declaring them
  # keeps the ones this script does not read from leaking out as globals
  local assembly_name assembly_results_dir db_dir
  assembly_paths "$1"

  mkdir -p "$assembly_results_dir"
  node src/createAssembly.ts "$assembly_name" "$UCSC_BUILT_DIR/list.json" >"$assembly_results_dir/config.json"
}
export -f process_assembly

run_for_assemblies process_assembly "$@"
