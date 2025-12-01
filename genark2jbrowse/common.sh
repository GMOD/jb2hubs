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
