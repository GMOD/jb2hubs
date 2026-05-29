#!/bin/bash

#
# uploadAll.sh
#
# Uploads the GenArk JBrowse data to AWS S3 and invalidates the CloudFront cache.
# Uses rclone's hasher backend to cache MD5 computations for fast syncing.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Syncing GenArk JBrowse data to S3 ==="
echo ""

# Sync using hasher backend for cached MD5 computations
# The genark-hubs-hashed remote caches MD5 hashes to avoid slow re-hashing
echo "[1/3] Syncing hubs (using cached MD5 hashes via rclone hasher)..."
rclone_log=$(mktemp)
rclone sync -c -v \
  --exclude "*.hash" \
  --exclude "*.xxh" \
  --exclude "*meta.json" \
  --exclude "*ncbi.json" \
  --exclude "*.notfound" \
  --exclude "*.checked" \
  --exclude "image.json" \
  --exclude "hub.txt" \
  genark-hubs-hashed: jbrowse-data:jbrowse.org/hubs/genark \
  --s3-storage-class INTELLIGENT_TIERING \
  --checkers 20 2>&1 | tee "$rclone_log"

echo ""

# Save processed hub json, which is used for desktop
echo "[2/3] Syncing processed hub JSON..."
s3_log=$(mktemp)
aws s3 sync processedHubJson s3://jbrowse.org/processedHubJson/ | tee "$s3_log"

echo ""

# Determine whether anything actually changed on S3. rclone -v logs one line
# per transferred/deleted object; aws s3 sync prints upload:/delete: lines.
rclone_changed=$(grep -cE ': (Copied|Deleted|Moved|Renamed)' "$rclone_log" || true)
s3_changed=$(grep -cE '^(upload|delete):' "$s3_log" || true)
rm -f "$rclone_log" "$s3_log"

if [ "$rclone_changed" -gt 0 ] || [ "$s3_changed" -gt 0 ]; then
  # Invalidate the CloudFront cache for the '/hubs/*' path so users get the
  # latest content from S3.
  echo "[3/3] Changes detected ($rclone_changed hub objects, $s3_changed processedHubJson objects); invalidating CloudFront cache..."
  aws cloudfront create-invalidation --distribution-id E13LGELJOT4GQO --paths "/hubs/*"
  echo "1" >"$SCRIPT_DIR/.upload-changed"
else
  echo "[3/3] Nothing changed on S3; skipping CloudFront invalidation."
  echo "0" >"$SCRIPT_DIR/.upload-changed"
fi

echo ""
echo "Upload complete!"
