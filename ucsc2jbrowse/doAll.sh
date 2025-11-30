#!/bin/bash

#
# doAll.sh
#
# Runs the entire UCSC to JBrowse pipeline.
#

set -euo pipefail

SCRIPT_DIR="$(dirname "$0")"
source "$SCRIPT_DIR/common.sh"

"$SCRIPT_DIR/downloadAll.sh"
"$SCRIPT_DIR/makeAll.sh"
