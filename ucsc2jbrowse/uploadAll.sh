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

# Sync using hasher backend for cached MD5 computations
# The ucsc-results-hashed remote caches MD5 hashes to avoid slow re-hashing.
# Tabix/CSI index files (*.csi, *.tbi) are excluded here and synced separately
# below so they can be uploaded with Cache-Control: no-cache. An index stores
# byte offsets into its .gz; if a browser ever pairs a stale cached index with
# freshly-regenerated data the offsets land mid-bgzf-block ("invalid bgzf
# header"). Forcing the index to revalidate (cheap 304s via ETag) keeps it in
# lockstep with the data, while the large .gz files keep normal caching so
# range requests during browsing aren't slowed by per-request revalidation.
echo "[1/3] Syncing files (using cached MD5 hashes via rclone hasher)..."
rclone_log=$(mktemp)
rclone sync -c -v \
  --exclude "*.hash" \
  --exclude "*.xxh" \
  --exclude "*.checked" \
  --exclude "*_meta.json" \
  --exclude "*/vs/*" \
  --exclude "*.csi" \
  --exclude "*.tbi" \
  ucsc-results-hashed: jbrowse-data:jbrowse.org/ucsc \
  --s3-storage-class INTELLIGENT_TIERING \
  --checkers 20 2>&1 | tee "$rclone_log"

echo ""

# Index files only, uploaded with Cache-Control: no-cache so browsers always
# revalidate them against S3 (via ETag) instead of serving a stale index.
echo "[2/3] Syncing tabix/CSI indexes (Cache-Control: no-cache)..."
idx_log=$(mktemp)
rclone sync -c -v \
  --include "*.csi" \
  --include "*.tbi" \
  --header-upload "Cache-Control: no-cache" \
  ucsc-results-hashed: jbrowse-data:jbrowse.org/ucsc \
  --s3-storage-class INTELLIGENT_TIERING \
  --checkers 20 2>&1 | tee "$idx_log"

echo ""

# Determine whether anything actually changed on S3.
rclone_changed=$(count_rclone_changes "$rclone_log")
idx_changed=$(count_rclone_changes "$idx_log")
total_changed=$((rclone_changed + idx_changed))
rm -f "$rclone_log" "$idx_log"

if [ "$total_changed" -gt 0 ]; then
  echo "[3/3] Changes detected ($total_changed objects); invalidating CloudFront cache..."
  cloudfront_invalidate "/ucsc/*"
  echo "1" >"$SCRIPT_DIR/.upload-changed"
else
  echo "[3/3] Nothing changed on S3; skipping CloudFront invalidation."
  echo "0" >"$SCRIPT_DIR/.upload-changed"
fi

echo ""
echo "Upload complete!"
