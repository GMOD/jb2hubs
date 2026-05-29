#!/bin/bash

#
# uploadAll.sh
#
# Uploads the JBrowse data to AWS S3 and invalidates the CloudFront cache.
# Uses rclone's hasher backend to cache MD5 computations for fast syncing.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Main Script ---

echo "=== Syncing JBrowse data to S3 ==="
echo ""

# Sync using hasher backend for cached MD5 computations
# The ucsc-results-hashed remote caches MD5 hashes to avoid slow re-hashing
echo "[1/2] Syncing files (using cached MD5 hashes via rclone hasher)..."
rclone_log=$(mktemp)
rclone sync -c -v \
  --exclude "*.hash" \
  --exclude "*.xxh" \
  --exclude "*.checked" \
  --exclude "*_meta.json" \
  --exclude "*/vs/*" \
  ucsc-results-hashed: jbrowse-data:jbrowse.org/ucsc \
  --s3-storage-class INTELLIGENT_TIERING \
  --checkers 20 2>&1 | tee "$rclone_log"

echo ""

# Determine whether anything actually changed on S3. rclone -v logs one line
# per transferred/deleted object.
rclone_changed=$(grep -cE ': (Copied|Deleted|Moved|Renamed)' "$rclone_log" || true)
rm -f "$rclone_log"

if [ "$rclone_changed" -gt 0 ]; then
  echo "[2/2] Changes detected ($rclone_changed objects); invalidating CloudFront cache..."
  aws cloudfront create-invalidation --distribution-id E13LGELJOT4GQO --paths "/ucsc/*"
  echo "1" >"$SCRIPT_DIR/.upload-changed"
else
  echo "[2/2] Nothing changed on S3; skipping CloudFront invalidation."
  echo "0" >"$SCRIPT_DIR/.upload-changed"
fi

echo ""
echo "Upload complete!"
