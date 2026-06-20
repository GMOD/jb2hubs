#!/bin/bash

#
# uploadAll.sh
#
# Uploads the JBrowse data to AWS S3 and invalidates the CloudFront cache.
# Uses rclone's hasher backend to cache MD5 computations for fast syncing.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# --- Main Script ---

echo "=== Syncing JBrowse data to S3 ==="
echo ""

# Sync data + tabix/CSI indexes (see rclone_sync_with_indexes for the
# cache-control rationale). The ucsc-results-hashed remote caches MD5 hashes to
# avoid slow re-hashing.
echo "Syncing files (data + indexes via rclone hasher)..."
total_changed=$(rclone_sync_with_indexes \
  ucsc-results-hashed: jbrowse-data:jbrowse.org/ucsc \
  --exclude "*.hash" \
  --exclude "*.xxh" \
  --exclude "*.checked" \
  --exclude "*_meta.json" \
  --exclude "*/vs/*")

echo ""

if [ "$total_changed" -gt 0 ]; then
  echo "Changes detected ($total_changed objects); invalidating CloudFront cache..."
  cloudfront_invalidate "/ucsc/*"
  echo "1" >"$SCRIPT_DIR/.upload-changed"
else
  echo "Nothing changed on S3; skipping CloudFront invalidation."
  echo "0" >"$SCRIPT_DIR/.upload-changed"
fi

echo ""
echo "Upload complete!"
