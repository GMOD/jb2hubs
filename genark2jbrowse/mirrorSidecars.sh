#!/bin/bash

#
# mirrorSidecars.sh
#
# Mirrors every assembly's chrom.sizes/chromAlias into its hub directory and
# points config.json at the local copies, so an hgdownload outage costs the
# sequence track rather than the whole assembly (jbrowse-core fails an assembly
# whole when any one of those fetches rejects).
#
# Sweeps every hub, not just changed ones: hubs built before this existed need
# backfilling, and a regenerated config comes back naming upstream urls. Already
# mirrored hubs are skipped on a stamp check, so a steady-state run is cheap.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

fd '^config\.json$' hubs | node src/mirrorSidecarsBatch.ts
