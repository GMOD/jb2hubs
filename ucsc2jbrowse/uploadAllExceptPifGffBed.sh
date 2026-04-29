#!/bin/bash

#
# uploadAllExceptPifGffBed.sh
#
# Uploads the JBrowse data to AWS S3 and invalidates the CloudFront cache.
# This script doesn't check the large .pif.gz files, use uploadAll for that
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

# --- Main Script ---

echo "Syncing JBrowse data to S3..."
# We use rclone because it has the ability to checksum, compared with plain aws sync (which often will re-upload exact same file, with updated filetime)
rclone sync -c -v --exclude "*.hash" --exclude "*.checked" --exclude "*_meta.json" --exclude "*.pif.gz" --exclude "*.bed.gz" --exclude "*.gff.gz" --exclude "*.csi" --exclude "*/vs/*" "$UCSC_BUILT_DIR" jbrowse-data:jbrowse.org/ucsc --s3-storage-class INTELLIGENT_TIERING --checkers 20

echo "Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id E13LGELJOT4GQO --paths "/ucsc/*"

echo "Upload complete!"
