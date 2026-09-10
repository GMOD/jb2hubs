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
#
# tracks.json is the parsed trackDb the derivation scripts and buildConfigs.ts
# read (32MB on hg38, 136MB over the corpus) and *.bak is an old editor
# leftover; neither is named by any config. Both had been shipping, and were
# live at jbrowse.org/ucsc/hg38/tracks.json on 2026-09-01. An exclude keeps
# them out of future syncs but does not delete what is already in the bucket
# -- rclone leaves excluded objects alone on both sides -- so clearing those is
# a one-off `rclone delete --include tracks.json --include '*.bak'`.
#
# list.json.raw is the same class of build state, and it was the expensive one.
# api.genome.ucsc.edu/list/ucscGenomes stamps every response with the time of
# YOUR request -- `"downloadTime": "2026:09:09T23:25:55Z", "downloadTimeStamp":
# 1788996355` -- so make.sh's curl writes different bytes on every run whether
# or not UCSC's data moved (the real data clock is `dataTime`, and it is stable).
# That guaranteed at least one changed object every run, and the object count is
# what gates BOTH the CloudFront invalidation here and run.sh's decision to
# rebuild the website: every run invalidated /ucsc/*, rebuilt astro and shipped
# the 5.4GB tree, and the "no changes, skipping website build, deploy and
# CloudFront invalidation" branch in run.sh could never once fire. Verified
# 2026-09-09 against the last 12 run logs -- `list.json.raw: Copied` in every
# completed one, and `ucsc=1` in every RUN SUMMARY. Nothing reads it from the
# bucket; src/transformGenomeList.ts turns it into list.json, which drops the
# timestamps and is what is published.
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
  --exclude "*/vs/*" \
  --exclude "tracks.json" \
  --exclude "list.json.raw" \
  --exclude "*.bak")

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
