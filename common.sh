#!/bin/bash
#
# common.sh
#
# Shared configuration for all scripts.
# Source this file at the top of other scripts: source "$(dirname "$0")/../common.sh"
#

# Suppress Node.js experimental warnings
export NODE_OPTIONS="--experimental-strip-types --no-warnings=ExperimentalWarning"

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
