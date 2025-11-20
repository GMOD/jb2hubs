#!/bin/bash
#
# compute_pif_md5.sh
#
# Pre-computes MD5 hashes for all .pif.gz files in the results directory.
# Stores them in .md5 files alongside each pif.gz file.
# Only recomputes if the file is newer than the cached hash.
#

set -euo pipefail

: ${UCSC_RESULTS_DIR:=~/ucscResults}

echo "Pre-computing MD5 hashes for .pif.gz files in $UCSC_RESULTS_DIR..."

# Find all .pif.gz files and compute/update their MD5 hashes
find "$UCSC_RESULTS_DIR" -name "*.pif.gz" -type f | while read -r pif_file; do
  md5_file="$pif_file.md5"

  # Only compute if hash doesn't exist or pif file is newer
  if [ ! -f "$md5_file" ] || [ "$pif_file" -nt "$md5_file" ]; then
    echo "Computing MD5 for $(basename "$pif_file")..."
    md5sum "$pif_file" | awk '{print $1}' > "$md5_file"
  fi
done

echo "MD5 computation complete!"
