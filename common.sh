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

# Decides whether a derived output needs (re)building from a source file, using
# the source's byte size as a cheap change stamp recorded in a hash file.
# Returns 0 (needs rebuild) when REPROCESS is set, the output or hash file is
# missing, or the source's size differs from the recorded stamp; else 1.
# Usage: if needs_rebuild out.bed.gz in.txt.gz out.hash; then ...; fi
needs_rebuild() {
  local output="$1" source="$2" hash_file="$3"
  local rebuild=0
  if [ -z "${REPROCESS:-}" ] && [ -f "$output" ] && [ -f "$hash_file" ]; then
    if [ "$(stat -c "%s" "$source")" = "$(cat "$hash_file")" ]; then
      rebuild=1
    fi
  fi
  return $rebuild
}
export -f needs_rebuild

# Records a source file's current byte-size stamp into a hash file, for a later
# needs_rebuild check.
# Usage: save_rebuild_stamp in.txt.gz out.hash
save_rebuild_stamp() {
  stat -c "%s" "$1" >"$2"
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
