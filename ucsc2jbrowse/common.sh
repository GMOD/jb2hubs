#!/bin/bash
#
# common.sh
#
# Shared configuration for ucsc2jbrowse scripts.
# Source this file at the top of other scripts: source "$(dirname "$0")/common.sh"
#

# Set the root directories for UCSC data and results.
# Can be overridden by setting environment variables.
: ${UCSC_DATA_DIR:=~/ucsc}
: ${UCSC_RESULTS_DIR:=~/ucscResults}
export UCSC_DATA_DIR UCSC_RESULTS_DIR

# Locale for consistent sorting
export LC_ALL=C

# Show progress bar only when running interactively
if [ -t 1 ]; then
  PARALLEL_OPTS="--bar"
else
  PARALLEL_OPTS=""
fi
export PARALLEL_OPTS

# Logs a message with a timestamp.
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}
export -f log

# Creates a directory if it doesn't exist.
ensure_dir() {
  mkdir -p "$1"
}
export -f ensure_dir
