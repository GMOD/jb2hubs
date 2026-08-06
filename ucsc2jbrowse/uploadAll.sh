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
#
# The two dotted stamps are local build state, and `*.hash` does not match
# either of them (both end in `_hash`, not `.hash`) -- .trackdb_hash has been
# shipping to the bucket since 2025. Excluding them is not tidiness: the object
# count this sync reports is what decides both the CloudFront invalidation and
# whether run.sh rebuilds and redeploys the 4.7GB website. .pipeline_hash
# changes on every converter edit including ones that leave every config
# byte-identical, so syncing it would turn a comment-only change to a .ts file
# into 238 "changed" objects and a full site redeploy.
echo "Syncing files (data + indexes via rclone hasher)..."
total_changed=$(rclone_sync_with_indexes \
  ucsc-results-hashed: jbrowse-data:jbrowse.org/ucsc \
  --exclude "*.hash" \
  --exclude ".trackdb_hash" \
  --exclude ".pipeline_hash" \
  --exclude ".derivation_hash" \
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
