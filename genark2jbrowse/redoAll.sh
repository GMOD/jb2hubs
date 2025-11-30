#!/bin/bash

# This script re-runs the makeAll.sh script with the REPROCESS flag set to true.
# This forces a re-download and re-processing of all data.
export REPROCESS=true
exec "$(dirname "$0")/makeAll.sh"
