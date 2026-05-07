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

# Show progress bar only when running interactively
if [ -t 1 ]; then
  PARALLEL_OPTS="--bar"
else
  PARALLEL_OPTS=""
fi
export PARALLEL_OPTS

# Logs a message with a timestamp.
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}
export -f log

# Creates a directory if it doesn't exist.
ensure_dir() {
  mkdir -p "$1"
}
export -f ensure_dir

# Incrementally updates a hash listing file using XXH3.
# Only re-hashes files newer than the listing; handles additions and deletions.
# Usage: make_file_listing <listing> <find_dir> [extra_find_args...]
make_file_listing() {
  local listing="$1" find_dir="$2"
  shift 2
  local extra_args=("$@")
  local algo="-H3"
  local algo_tag="# algo=xxh3"
  local tmp_new tmp_cur
  tmp_new=$(mktemp)
  tmp_cur=$(mktemp)

  if [[ ! -f "$listing" ]] || ! head -1 "$listing" | grep -qF "$algo_tag"; then
    find "$find_dir" -type f "${extra_args[@]}" -exec xxhsum "$algo" {} + | sort -k2,2 >"${listing}.tmp"
    {
      echo "$algo_tag"
      cat "${listing}.tmp"
    } >"$listing"
    rm -f "${listing}.tmp" "$tmp_new" "$tmp_cur"
    return 0
  fi

  if [[ ! -d "$find_dir" ]]; then
    echo "ERROR: $find_dir does not exist or is not mounted, aborting to preserve existing listing" >&2
    rm -f "$tmp_new" "$tmp_cur"
    return 1
  fi

  find "$find_dir" -type f "${extra_args[@]}" -newer "$listing" -exec xxhsum "$algo" {} + >"$tmp_new"
  find "$find_dir" -type f "${extra_args[@]}" | sort >"$tmp_cur"

  tail -n +2 "$listing" |
    awk 'NR==FNR{skip[$2]=1; next} !($2 in skip)' "$tmp_new" - |
    awk 'NR==FNR{exists["(" $1 ")"]=1; next} ($2 in exists)' "$tmp_cur" - |
    {
      cat
      cat "$tmp_new"
    } |
    sort -k2,2 >"${listing}.tmp"
  {
    echo "$algo_tag"
    cat "${listing}.tmp"
  } >"$listing"
  rm -f "${listing}.tmp" "$tmp_new" "$tmp_cur"
}
export -f make_file_listing
