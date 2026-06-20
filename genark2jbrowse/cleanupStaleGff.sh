#!/bin/bash
#
# cleanupStaleGff.sh
#
# Removes GFF files from gff/ and bgz/ whose accession is not present in
# processedHubJson/all.json (i.e. no longer in the GenArk/UCSC listing).
# Also removes leftover uncompressed .gff files in bgz/.
#
# Usage:
#   ./cleanupStaleGff.sh        # dry run (shows what would be deleted)
#   ./cleanupStaleGff.sh --exec # actually delete the files
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ALL_JSON="$SCRIPT_DIR/processedHubJson/all.json"
LOG_FILE="$SCRIPT_DIR/CLEANED.md"
DRY_RUN=true

if [ "${1:-}" = "--exec" ]; then
  DRY_RUN=false
fi

log() {
  if ! $DRY_RUN; then
    echo "$1" >>"$LOG_FILE"
  fi
}

delete_file() {
  local f="$1"
  if [ -f "$f" ]; then
    if $DRY_RUN; then
      echo "  [dry-run] would delete: $f"
    else
      echo "  deleting: $f"
      rm "$f"
      log "- $(basename "$f")"
    fi
  fi
}

# Load known GFF basenames into a hash set for O(1) lookup. Looked up once per
# candidate file across tens of thousands of files, so a grep-the-whole-file
# probe per candidate would be quadratic.
declare -A KNOWN
while IFS= read -r name; do
  KNOWN["$name"]=1
done < <(jq -r '.[].ncbiGff | select(. != null) | split("/") | last' "$ALL_JSON")

# Safety guard: this pipeline tracks tens of thousands of GenArk hubs, so a tiny
# known set means all.json is truncated or corrupt. Deleting against it would
# wipe valid GFFs that are expensive to re-download, so refuse to proceed.
known_count=${#KNOWN[@]}
if [ "$known_count" -lt 1000 ]; then
  echo "ERROR: only $known_count known GFFs in $ALL_JSON; refusing to run (all.json looks incomplete/corrupt)." >&2
  exit 1
fi

is_known() {
  [[ -n "${KNOWN[$1]+set}" ]]
}

if ! $DRY_RUN; then
  echo "# Cleanup log ($(date -u '+%Y-%m-%d %H:%M UTC'))" >"$LOG_FILE"
  echo "" >>"$LOG_FILE"
fi

# Remove leftover uncompressed .gff files in bgz/
echo "=== Leftover uncompressed .gff files in bgz/ ==="
if ! $DRY_RUN; then log "## Leftover uncompressed .gff files in bgz/"; fi
for f in "$SCRIPT_DIR/bgz/"*.gff; do
  [ -f "$f" ] || continue
  delete_file "$f"
done

# Remove .csi files in bgz/ with no corresponding .gz
echo ""
echo "=== Orphaned .csi files in bgz/ ==="
if ! $DRY_RUN; then
  log ""
  log "## Orphaned .csi files in bgz/"
fi
for f in "$SCRIPT_DIR/bgz/"GC[FA]_*.gz.csi; do
  [ -f "$f" ] || continue
  if [ ! -f "${f%.csi}" ]; then
    echo "  orphaned csi: $(basename "$f")"
    delete_file "$f"
  fi
done

# Remove GFF files not in all.json
for dir in gff bgz; do
  echo ""
  echo "=== GFF files not in listing ($dir/) ==="
  if ! $DRY_RUN; then
    log ""
    log "## GFF files not in listing ($dir/)"
  fi

  for f in "$SCRIPT_DIR/$dir/"GC[FA]_*.gz; do
    [ -f "$f" ] || continue
    filename=$(basename "$f")
    if ! is_known "$filename"; then
      echo "  not in listing: $filename"
      delete_file "$f"
      delete_file "${f}.csi"
    fi
  done
done

if $DRY_RUN; then
  echo ""
  echo "Dry run complete. Run with --exec to delete."
else
  echo ""
  echo "Cleanup complete. Log written to $LOG_FILE"
fi
