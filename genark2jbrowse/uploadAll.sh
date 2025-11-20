#!/bin/bash

#
# uploadAll.sh
#
# Uploads the GenArk JBrowse data to AWS S3 and invalidates the CloudFront cache.
# Uses rclone's hasher backend to cache MD5 computations for fast syncing.
#

set -euo pipefail

echo "=== Syncing GenArk JBrowse data to S3 ==="
echo ""

# Sync using hasher backend for cached MD5 computations
# The genark-hubs-hashed remote caches MD5 hashes to avoid slow re-hashing
echo "[1/3] Syncing hubs (using cached MD5 hashes via rclone hasher)..."
rclone sync -c -v \
  --exclude "*.hash" \
  --exclude "*.xxh" \
  --exclude "*meta.json" \
  --exclude "*ncbi.json" \
  --exclude "*.notfound" \
  --exclude "image.json" \
  --exclude "hub.txt" \
  genark-hubs-hashed: jbrowse-data:jbrowse.org/hubs/genark \
  --s3-storage-class INTELLIGENT_TIERING \
  --checkers 20

echo ""

# Save processed hub json, which is used for desktop
echo "[2/3] Syncing processed hub JSON..."
aws s3 sync processedHubJson s3://jbrowse.org/processedHubJson/

echo ""

# Invalidate the CloudFront cache for the '/hubs/*' path.
# This ensures that users get the latest content from S3.
echo "[3/3] Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id E13LGELJOT4GQO --paths "/hubs/*"

echo ""
echo "Upload complete!"
