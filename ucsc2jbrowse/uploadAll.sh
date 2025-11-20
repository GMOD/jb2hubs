#!/bin/bash

#
# uploadAll.sh
#
# Uploads the JBrowse data to AWS S3 and invalidates the CloudFront cache.
# Uses smart hashing for .pif.gz files to avoid slow re-hashing on every sync.
#

set -euo pipefail

# --- Configuration ---

: ${UCSC_RESULTS_DIR:=~/ucscResults}

# --- Main Script ---

echo "=== Syncing JBrowse data to S3 ==="
echo ""

# Step 1: Sync everything except .pif.gz and .csi files using checksum mode
echo "[1/3] Syncing non-PIF files (using checksums)..."
# We use rclone because it has the ability to checksum, compared with plain aws sync (which often will re-upload exact same file, with updated filetime)
rclone sync -c -v \
  --exclude "*.hash" \
  --exclude "*.xxh" \
  --exclude "*.md5" \
  --exclude "*_meta.json" \
  --exclude "*.pif.gz" \
  --exclude "*.csi" \
  "$UCSC_RESULTS_DIR" jbrowse-data:jbrowse.org/ucsc \
  --s3-storage-class INTELLIGENT_TIERING \
  --checkers 20

echo ""

# Step 2: Smart sync for .pif.gz and .csi files (using cached MD5 hashes)
echo "[2/3] Syncing PIF files (using cached MD5 hashes)..."
./sync_pif_smart.sh

echo ""

# Step 3: Invalidate CloudFront cache
echo "[3/3] Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id E13LGELJOT4GQO --paths "/ucsc/*"

echo ""
echo "Upload complete!"
