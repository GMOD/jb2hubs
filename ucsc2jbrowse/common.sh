#!/bin/bash
#
# common.sh
#
# Shared configuration for ucsc2jbrowse scripts.
# Source this file at the top of other scripts: source "$(dirname "$0")/common.sh"
#

# Source the root common.sh for shared utilities
source "$(dirname "$0")/../common.sh"

# Set the root directories for UCSC data and results.
# Can be overridden by setting environment variables.
: "${UCSC_DOWNLOADS_DIR:=/mnt/sdb/cdiesh/jb2hubs/ucscDownloads}"
: "${UCSC_BUILT_DIR:=/mnt/sdb/cdiesh/jb2hubs/ucscBuilt}"
export UCSC_DOWNLOADS_DIR UCSC_BUILT_DIR

# Track families we deliberately do NOT materialize from the golden-path
# database tables, because they are huge and/or extremely numerous: per-sample
# SNP tables (snp*) and the entire ENCODE collection (wgEncode*). Converting,
# storing, and uploading them isn't worth it.
#
# This is the single source of truth for that policy, applied uniformly by the
# bed/gene/rmsk track builders. For some passes a given prefix never matches
# (e.g. no rmsk table is named snp*), so the gate is simply a no-op there — but
# keeping one rule means there's a single place to reason about and tune it.
is_skipped_track() {
  case "$1" in
  snp* | wgEncode*) return 0 ;;
  *) return 1 ;;
  esac
}
export -f is_skipped_track
