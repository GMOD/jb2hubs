#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

find ../hubs/ -type f \( -name "*.gff.gz" -o -name "*.ix" \) -exec xxhsum {} + | LC_ALL=C sort -k2,2 >fileListing.txt
