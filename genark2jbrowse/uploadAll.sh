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

# Sync using hasher backend for cached MD5 computations
# The genark-hubs-hashed remote caches MD5 hashes to avoid slow re-hashing.
# Tabix/CSI index files (*.csi, *.tbi) are excluded here and synced separately
# below so they can be uploaded with Cache-Control: no-cache. An index stores
# byte offsets into its .gz; if a browser ever pairs a stale cached index with
# freshly-regenerated data the offsets land mid-bgzf-block ("invalid bgzf
# header"). Forcing the index to revalidate (cheap 304s via ETag) keeps it in
# lockstep with the data, while the large .gz files keep normal caching so
# range requests during browsing aren't slowed by per-request revalidation.
echo "[1/4] Syncing hubs (using cached MD5 hashes via rclone hasher)..."
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
  --exclude "*.csi" \
  --exclude "*.tbi" \
  genark-hubs-hashed: jbrowse-data:jbrowse.org/hubs/genark \
  --s3-storage-class INTELLIGENT_TIERING \
  --checkers 20 2>&1 | tee "$rclone_log"

echo ""

# Index files only, uploaded with Cache-Control: no-cache so browsers always
# revalidate them against S3 (via ETag) instead of serving a stale index.
echo "[2/4] Syncing tabix/CSI indexes (Cache-Control: no-cache)..."
idx_log=$(mktemp)
rclone sync -c -v \
  --include "*.csi" \
  --include "*.tbi" \
  --header-upload "Cache-Control: no-cache" \
  genark-hubs-hashed: jbrowse-data:jbrowse.org/hubs/genark \
  --s3-storage-class INTELLIGENT_TIERING \
  --checkers 20 2>&1 | tee "$idx_log"

echo ""

# Save processed hub json, which is used for desktop
echo "[3/4] Syncing processed hub JSON..."
s3_log=$(mktemp)
aws s3 sync processedHubJson s3://jbrowse.org/processedHubJson/ | tee "$s3_log"

echo ""

# Determine whether anything actually changed on S3. rclone -v logs one line
# per transferred/deleted object; aws s3 sync prints upload:/delete: lines.
# The hub data and processedHubJson live under different prefixes, so invalidate
# only the prefix(es) that actually changed (invalidating /hubs/* would not
# cover a processedHubJson-only change, and vice versa).
rclone_changed=$(count_rclone_changes "$rclone_log")
idx_changed=$(count_rclone_changes "$idx_log")
hub_changed=$((rclone_changed + idx_changed))
s3_changed=$(grep -cE '^(upload|delete):' "$s3_log" || true)
rm -f "$rclone_log" "$idx_log" "$s3_log"

invalidate_paths=()
[ "$hub_changed" -gt 0 ] && invalidate_paths+=("/hubs/*")
[ "$s3_changed" -gt 0 ] && invalidate_paths+=("/processedHubJson/*")

if [ "${#invalidate_paths[@]}" -gt 0 ]; then
  echo "[4/4] Changes detected ($hub_changed hub objects, $s3_changed processedHubJson objects); invalidating CloudFront cache for ${invalidate_paths[*]}..."
  cloudfront_invalidate "${invalidate_paths[@]}"
  echo "1" >"$SCRIPT_DIR/.upload-changed"
else
  echo "[4/4] Nothing changed on S3; skipping CloudFront invalidation."
  echo "0" >"$SCRIPT_DIR/.upload-changed"
fi

echo ""
echo "Upload complete!"
