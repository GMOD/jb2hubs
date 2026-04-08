#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

make_file_listing fileListing.txt ../hubs '(' -name "*.gff.gz" -o -name "*.ix" ')'
