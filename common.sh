#!/bin/bash
#
# common.sh
#
# Shared configuration for all scripts.
# Source this file at the top of other scripts: source "$(dirname "$0")/../common.sh"
#

# Suppress Node.js experimental warnings
export NODE_OPTIONS="--experimental-strip-types --no-warnings=ExperimentalWarning"

# Locale for consistent sorting
export LC_ALL=C

# Suppress GNU parallel's citation notice everywhere; show progress bar only
# when running interactively.
if [ -t 1 ]; then
  PARALLEL_OPTS="--will-cite --bar"
else
  PARALLEL_OPTS="--will-cite"
fi
export PARALLEL_OPTS

# CloudFront distribution that fronts jbrowse.org. Centralized so the upload
# scripts don't each hardcode the id.
export CLOUDFRONT_DISTRIBUTION_ID="E13LGELJOT4GQO"

# Logs a message with a timestamp.
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}
export -f log

# Counts changed objects in an rclone -v log: one line is printed per
# transferred/deleted object. Returns 0 (not an error) when nothing changed.
count_rclone_changes() {
  grep -cE ': (Copied|Deleted|Moved|Renamed)' "$1" || true
}
export -f count_rclone_changes

# Invalidates one or more CloudFront paths on the jbrowse.org distribution.
# Usage: cloudfront_invalidate "/ucsc/*" ["/processedHubJson/*" ...]
cloudfront_invalidate() {
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" --paths "$@"
}
export -f cloudfront_invalidate

# Uploads a local file to S3 only if it differs from the last upload, tracked
# via a local stamp file copy -- avoids needing S3 read permissions just to
# check for changes (every upload script here otherwise only ever writes),
# and avoids `aws s3 sync` having to list an entire large destination prefix
# just to check one small file. Prints "1" (uploaded) or "0" (unchanged) to
# stdout; diagnostics go to stderr. A missing local file is not an error: it
# just leaves the live copy alone and reports unchanged. An upload failure
# returns non-zero WITHOUT printing a status or touching the stamp, so a
# `changed=$(upload_if_changed ...)` caller under `set -e` aborts instead of
# silently recording a failed upload as done (bash's -e does not fire on a
# failing command mid-function when the function's own output is captured by
# a command substitution -- only the function's own final exit status does).
# Usage: changed=$(upload_if_changed <local-file> <s3-uri> <stamp-file>)
upload_if_changed() {
  local local_file="$1" s3_uri="$2" stamp_file="$3"
  if [ ! -f "$local_file" ]; then
    echo "$local_file not found locally; leaving the live copy unchanged." >&2
    echo 0
    return
  fi
  if diff -q "$local_file" "$stamp_file" >/dev/null 2>&1; then
    echo 0
    return
  fi
  if ! aws s3 cp "$local_file" "$s3_uri" >&2; then
    echo "upload_if_changed: failed to upload $local_file to $s3_uri" >&2
    return 1
  fi
  cp "$local_file" "$stamp_file"
  echo 1
}
export -f upload_if_changed

# Two-phase rclone sync shared by the upload scripts. First syncs data objects
# with normal caching (indexes excluded), then the .csi/.tbi indexes with
# Cache-Control: no-cache. An index stores byte offsets into its .gz; pairing a
# stale cached index with freshly-regenerated data lands offsets mid-bgzf-block
# ("invalid bgzf header"). Forcing the index to revalidate (cheap 304s via ETag)
# keeps it in lockstep with the data, while large .gz files keep normal caching
# so range requests during browsing aren't slowed by per-request revalidation.
#
# Extra args are passed only to the data phase (e.g. --exclude rules). Verbose
# rclone output goes to stderr; the changed-object count is printed to stdout.
# Usage: changed=$(rclone_sync_with_indexes <src> <dest> [extra rclone args...])
rclone_sync_with_indexes() {
  local src="$1" dest="$2"
  shift 2
  local data_log idx_log
  data_log=$(mktemp)
  idx_log=$(mktemp)

  echo "Syncing data objects (cached MD5 hashes via rclone hasher)..." >&2
  rclone sync -c -v \
    --exclude "*.csi" --exclude "*.tbi" "$@" \
    "$src" "$dest" \
    --s3-storage-class INTELLIGENT_TIERING --checkers 20 2>&1 | tee "$data_log" >&2

  echo "Syncing tabix/CSI indexes (Cache-Control: no-cache)..." >&2
  rclone sync -c -v \
    --include "*.csi" --include "*.tbi" \
    --header-upload "Cache-Control: no-cache" \
    "$src" "$dest" \
    --s3-storage-class INTELLIGENT_TIERING --checkers 20 2>&1 | tee "$idx_log" >&2

  local changed=$(($(count_rclone_changes "$data_log") + $(count_rclone_changes "$idx_log")))
  rm -f "$data_log" "$idx_log"
  echo "$changed"
}
export -f rclone_sync_with_indexes

# Creates a directory if it doesn't exist.
ensure_dir() {
  mkdir -p "$1"
}
export -f ensure_dir

# Decides whether a derived output needs (re)building from a source file, using
# the source's XXH3 content hash as the change stamp recorded in a hash file.
# (Byte size was cheaper but missed same-size content changes — a re-published
# UCSC table that changes content but keeps its compressed size.)
# Returns 0 (needs rebuild) when REPROCESS is set, the output or hash file is
# missing, or the source's hash differs from the recorded stamp; else 1.
# Usage: if needs_rebuild out.bed.gz in.txt.gz out.hash; then ...; fi
needs_rebuild() {
  local output="$1" source="$2" hash_file="$3"
  local rebuild=0
  if [ -z "${REPROCESS:-}" ] && [ -f "$output" ] && [ -f "$hash_file" ]; then
    if [ "$(xxhsum -H3 "$source" | awk '{print $NF}')" = "$(cat "$hash_file")" ]; then
      rebuild=1
    fi
  fi
  return $rebuild
}
export -f needs_rebuild

# Records a source file's current XXH3 content hash into a hash file, for a later
# needs_rebuild check.
# Usage: save_rebuild_stamp in.txt.gz out.hash
save_rebuild_stamp() {
  xxhsum -H3 "$1" | awk '{print $NF}' >"$2"
}
export -f save_rebuild_stamp

# Incrementally updates a hash listing file using XXH3.
# Re-hashes files newer than the listing plus any file missing from it; handles
# additions and deletions.
# Usage: make_file_listing <listing> <find_dir> [extra_find_args...]
make_file_listing() {
  local listing="$1" find_dir="$2"
  shift 2
  local extra_args=("$@")
  local algo="-H3"
  local algo_tag="# algo=xxh3"
  local tmp_new tmp_cur tmp_listed tmp_new_paths tmp_keep
  tmp_new=$(mktemp)
  tmp_cur=$(mktemp)
  tmp_listed=$(mktemp)
  tmp_new_paths=$(mktemp)
  tmp_keep=$(mktemp)
  local clean=("$tmp_new" "$tmp_cur" "$tmp_listed" "$tmp_new_paths" "$tmp_keep" "${listing}.tmp")

  if [[ ! -f "$listing" ]] || ! head -1 "$listing" | grep -qF "$algo_tag"; then
    find "$find_dir" -type f "${extra_args[@]}" -exec xxhsum "$algo" {} + | sort -k2,2 >"${listing}.tmp"
    {
      echo "$algo_tag"
      cat "${listing}.tmp"
    } >"$listing"
    rm -f "${clean[@]}"
    return 0
  fi

  if [[ ! -d "$find_dir" ]]; then
    echo "ERROR: $find_dir does not exist or is not mounted, aborting to preserve existing listing" >&2
    rm -f "${clean[@]}"
    return 1
  fi

  # Re-hash files modified since the previous listing was written...
  find "$find_dir" -type f "${extra_args[@]}" -newer "$listing" -exec xxhsum "$algo" {} + >"$tmp_new"
  find "$find_dir" -type f "${extra_args[@]}" | sort >"$tmp_cur"

  # ...and also hash any file that exists now but is absent from the listing.
  # -newer only matches files modified after the previous run finished, so
  # write-once files (e.g. *.gff.gz) created earlier would otherwise never be
  # recorded. Compare current paths against the paths already in the listing.
  tail -n +2 "$listing" | sed -E 's/^XXH3 \((.*)\) = [0-9a-f]+$/\1/' | sort >"$tmp_listed"
  comm -23 "$tmp_cur" "$tmp_listed" | tr '\n' '\0' | xargs -0 -r xxhsum "$algo" >>"$tmp_new"
  sort -u -o "$tmp_new" "$tmp_new"

  # Keep cached entries for files that still exist and were not re-hashed, then
  # add the freshly hashed entries. Done with comm/join (keyed on path) rather
  # than a two-pass awk, which silently drops everything when tmp_new is empty.
  sed -E 's/^XXH3 \((.*)\) = [0-9a-f]+$/\1/' "$tmp_new" | sort >"$tmp_new_paths"
  comm -23 "$tmp_cur" "$tmp_new_paths" |
    join -t $'\t' - <(tail -n +2 "$listing" | sed -E 's/^XXH3 \((.*)\) = [0-9a-f]+$/\1\t&/' | sort -t $'\t' -k1,1) |
    cut -f2- >"$tmp_keep"

  {
    echo "$algo_tag"
    cat "$tmp_keep" "$tmp_new" | sort -k2,2
  } >"$listing"
  rm -f "${clean[@]}"
}
export -f make_file_listing
