#!/bin/bash

#
# uploadAll.sh
#
# Uploads the GenArk JBrowse data to AWS S3 and invalidates the CloudFront cache.
# Uses rclone's hasher backend to cache MD5 computations for fast syncing.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

echo "=== Syncing GenArk JBrowse data to S3 ==="
echo ""

# Sync hub data + tabix/CSI indexes (see rclone_sync_with_indexes for the
# cache-control rationale). The genark-hubs-hashed remote caches MD5 hashes to
# avoid slow re-hashing.
echo "[1/3] Syncing hubs (data + indexes via rclone hasher)..."
hub_changed=$(rclone_sync_with_indexes \
  genark-hubs-hashed: jbrowse-data:jbrowse.org/hubs/genark \
  --exclude "*.hash" \
  --exclude "*.xxh" \
  --exclude "*meta.json" \
  --exclude "*ncbi.json" \
  --exclude "*.notfound" \
  --exclude "*.checked" \
  --exclude "image.json" \
  --exclude "hub.txt")

echo ""

# Save processed hub json, which is used for desktop
echo "[2/3] Syncing processed hub JSON..."
s3_log=$(mktemp)
aws s3 sync processedHubJson s3://jbrowse.org/processedHubJson/ | tee "$s3_log"
s3_changed=$(grep -cE '^(upload|delete):' "$s3_log" || true)
rm -f "$s3_log"

echo ""

# The hub data and processedHubJson live under different prefixes, so invalidate
# only the prefix(es) that actually changed (invalidating /hubs/* would not
# cover a processedHubJson-only change, and vice versa).
invalidate_paths=()
[ "$hub_changed" -gt 0 ] && invalidate_paths+=("/hubs/*")
[ "$s3_changed" -gt 0 ] && invalidate_paths+=("/processedHubJson/*")

if [ "${#invalidate_paths[@]}" -gt 0 ]; then
  echo "[3/3] Changes detected ($hub_changed hub objects, $s3_changed processedHubJson objects); invalidating CloudFront cache for ${invalidate_paths[*]}..."
  cloudfront_invalidate "${invalidate_paths[@]}"
  echo "1" >"$SCRIPT_DIR/.upload-changed"
else
  echo "[3/3] Nothing changed on S3; skipping CloudFront invalidation."
  echo "0" >"$SCRIPT_DIR/.upload-changed"
fi

echo ""
echo "Upload complete!"
