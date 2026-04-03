#!/bin/bash

#
# uploadAll.sh
#
# Uploads the JBrowse data to AWS S3 and invalidates the CloudFront cache.
# Uses rclone's hasher backend to cache MD5 computations for fast syncing.
#

set -euo pipefail

# --- Main Script ---

echo "=== Syncing JBrowse data to S3 ==="
echo ""

# Sync using hasher backend for cached MD5 computations
# The ucsc-results-hashed remote caches MD5 hashes to avoid slow re-hashing
echo "[1/2] Syncing files (using cached MD5 hashes via rclone hasher)..."
rclone sync -c -v \
  --exclude "*.hash" \
  --exclude "*_meta.json" \
  --exclude "*/vs/*" \
  ucsc-results-hashed: jbrowse-data:jbrowse.org/ucsc \
  --s3-storage-class INTELLIGENT_TIERING \
  --checkers 20

echo ""

# Invalidate CloudFront cache
echo "[2/2] Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id E13LGELJOT4GQO --paths "/ucsc/*"

echo ""
echo "Upload complete!"
