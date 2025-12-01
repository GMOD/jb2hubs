#!/bin/bash

#
# doAll.sh
#
# Runs the entire UCSC to JBrowse pipeline.
#

set -euo pipefail

SCRIPT_DIR="$(dirname "$0")"
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

./downloadAll.sh
./makeAll.sh
