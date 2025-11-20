#!/bin/bash
#
# sync_pif_smart.sh
#
# Intelligently syncs .pif.gz and .csi files to S3 by comparing cached MD5 hashes
# with remote S3 ETags. Only uploads files where hashes differ.
#
# This avoids the slow hash computation that happens with `rclone sync -c`.
#

set -euo pipefail

: ${UCSC_RESULTS_DIR:=~/ucscResults}
REMOTE="jbrowse-data:jbrowse.org/ucsc"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "=== Smart PIF Sync ==="
echo "Local: $UCSC_RESULTS_DIR"
echo "Remote: $REMOTE"
echo ""

# Step 1: Pre-compute MD5 hashes for local .pif.gz files
echo "[1/4] Pre-computing MD5 hashes for local .pif.gz files..."
./compute_pif_md5.sh

# Step 2: Get remote file listing with hashes (ETags)
echo "[2/4] Fetching remote file metadata from S3..."
rclone lsjson -R --hash "$REMOTE" --files-only \
  --include "*.pif.gz" --include "*.csi" \
  > "$TEMP_DIR/remote_files.json"

# Step 3: Compare local and remote hashes, build list of files to sync
echo "[3/4] Comparing local and remote hashes..."

python3 <<'PYTHON_SCRIPT' "$UCSC_RESULTS_DIR" "$TEMP_DIR/remote_files.json" "$TEMP_DIR/files_to_sync.txt"
import json
import os
import sys
from pathlib import Path

local_dir = Path(sys.argv[1])
remote_json = sys.argv[2]
output_file = sys.argv[3]

# Load remote file metadata
with open(remote_json) as f:
    remote_files = json.load(f)

# Build a dict of remote files: path -> md5
remote_hashes = {}
for item in remote_files:
    path = item['Path']
    md5 = item.get('Hashes', {}).get('MD5', '')
    if md5:
        remote_hashes[path] = md5.lower()

files_to_sync = []
stats = {'new': 0, 'changed': 0, 'unchanged': 0, 'no_hash': 0}

# Check all local .pif.gz files
for pif_file in local_dir.rglob("*.pif.gz"):
    rel_path = str(pif_file.relative_to(local_dir))
    md5_file = pif_file.with_suffix(pif_file.suffix + '.md5')
    csi_file = pif_file.with_suffix(pif_file.suffix + '.csi')

    # Read local MD5 hash
    if md5_file.exists():
        with open(md5_file) as f:
            local_md5 = f.read().strip().lower()
    else:
        print(f"Warning: No MD5 hash for {rel_path}, will sync")
        files_to_sync.append(rel_path)
        if csi_file.exists():
            files_to_sync.append(str(csi_file.relative_to(local_dir)))
        stats['no_hash'] += 1
        continue

    # Compare with remote
    if rel_path not in remote_hashes:
        # New file
        print(f"New: {rel_path}")
        files_to_sync.append(rel_path)
        if csi_file.exists():
            files_to_sync.append(str(csi_file.relative_to(local_dir)))
        stats['new'] += 1
    elif remote_hashes[rel_path] != local_md5:
        # Changed file
        print(f"Changed: {rel_path} (local: {local_md5[:8]}... != remote: {remote_hashes[rel_path][:8]}...)")
        files_to_sync.append(rel_path)
        if csi_file.exists():
            files_to_sync.append(str(csi_file.relative_to(local_dir)))
        stats['changed'] += 1
    else:
        # Unchanged
        stats['unchanged'] += 1

# Write files to sync
with open(output_file, 'w') as f:
    for file_path in files_to_sync:
        f.write(file_path + '\n')

print(f"\nSummary:")
print(f"  New files: {stats['new']}")
print(f"  Changed files: {stats['changed']}")
print(f"  Unchanged files: {stats['unchanged']}")
print(f"  Files without hash: {stats['no_hash']}")
print(f"  Total files to sync: {len(files_to_sync)}")

PYTHON_SCRIPT

# Step 4: Sync only the files that need updating
files_to_sync=$(wc -l < "$TEMP_DIR/files_to_sync.txt")

if [ "$files_to_sync" -eq 0 ]; then
  echo "[4/4] No files need syncing. All up to date!"
else
  echo "[4/4] Syncing $files_to_sync files to S3..."
  rclone copy "$UCSC_RESULTS_DIR" "$REMOTE" \
    --files-from "$TEMP_DIR/files_to_sync.txt" \
    --s3-storage-class INTELLIGENT_TIERING \
    --checksum \
    --progress \
    --checkers 20
  echo "Sync complete!"
fi
