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
: ${UCSC_DOWNLOADS_DIR:=/mnt/sdb/cdiesh/jb2hubs/ucscDownloads}
: ${UCSC_BUILT_DIR:=/mnt/sdb/cdiesh/jb2hubs/ucscBuilt}
export UCSC_DOWNLOADS_DIR UCSC_BUILT_DIR
