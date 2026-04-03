#!/bin/bash

source "$(dirname "$0")/common.sh"

find ../hubs/ -type f \( -name "*.gff.gz" -o -name "*.ix" \) | parallel $PARALLEL_OPTS 'stat -c "%s %n" {}' | LC_ALL=C sort -k2,2 >fileListing.txt
