#!/bin/bash
#
# lib/derive.sh
#
# Everything that decides the bytes a derived .gz holds: the locale sort runs
# under, the pinned CLI, the rebuild stamps and the bgzip toolchain guard.
# Sourced by lib/common.sh. ucsc2jbrowse/make.sh hashes this file, not
# common.sh, into DERIVATION_HASH, so an edit here re-derives every UCSC track
# file and an edit to the upload or flag code in common.sh does not.

export LC_ALL=C

# The repo's pinned @jbrowse/cli, never a global one: make-pif, text-index and
# sort-gff all go through it, so the corpus is a function of package.json.
export JBROWSE_CLI="${JBROWSE_CLI:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/node_modules/.bin/jbrowse}"

# Prints a file's XXH3 hash, failing when there is none. xxhsum 0.8.1 writes a
# carriage-return progress line to stderr on every call and has no flag to stop
# it, and these run once per derived file, so its stderr is dropped.
file_xxh3() {
  local h
  h=$(xxhsum -H3 "$1" 2>/dev/null | awk '{print $NF}')
  [ -n "$h" ] || return 1
  printf '%s\n' "$h"
}
export -f file_xxh3

# Returns 0 (rebuild) when REPROCESS or REDERIVE is set, the output or stamp is
# missing, the source cannot be hashed, or its hash differs from the stamp.
# REDERIVE is the code half: the caller sets it when its derivation sources
# changed, since the stamp tracks only the source data.
# Usage: if needs_rebuild out.bed.gz in.txt.gz out.hash; then ...; fi
needs_rebuild() {
  local output="$1" source="$2" hash_file="$3" current stored
  if [ -n "${REPROCESS:-}" ] || [ -n "${REDERIVE:-}" ] ||
    [ ! -f "$output" ] || [ ! -f "$hash_file" ]; then
    return 0
  fi
  current=$(file_xxh3 "$source") || return 0
  read -r stored <"$hash_file" || return 0
  [ "$current" != "$stored" ]
}
export -f needs_rebuild

# Records the source's hash as the stamp needs_rebuild reads. Refuses when the
# output is missing or empty, or the source cannot be hashed: a recipe that
# exits 0 having written nothing would otherwise be skipped by every later run.
# The argument order matches needs_rebuild's.
# Usage: save_rebuild_stamp out.bed.gz in.txt.gz out.hash
save_rebuild_stamp() {
  local output="$1" source="$2" hash_file="$3" h
  if [ ! -s "$output" ]; then
    echo "save_rebuild_stamp: $output was not produced (or is empty); refusing to stamp $hash_file" >&2
    return 1
  fi
  if ! h=$(file_xxh3 "$source"); then
    echo "save_rebuild_stamp: could not hash $source; refusing to stamp $hash_file" >&2
    return 1
  fi
  printf '%s\n' "$h" >"$hash_file"
}
export -f save_rebuild_stamp

# Sorts a BED-like file by (chrom, start), skipping the sort when it already is.
sort_if_needed() {
  if sort -c -k1,1 -k2,2n "$1" >/dev/null 2>&1; then
    cat "$1"
  else
    sort -k1,1 -k2,2n "$1"
  fi
}
export -f sort_if_needed

# bgzip's bytes depend on its build, not only its version: htslib 1.23.1 on
# libz emits ~6% more than on libdeflate with identical content, and a silent
# swap on 2026-08-27 rewrote and re-sent 76.7 GB and left fresh .gz beside stale
# .csi in the bucket. So the guard pins the bytes bgzip emits for a canary. The
# canary is large on purpose: a short input hashes the same under builds that
# disagree on real files.
BGZIP_TOOLCHAIN_SIGNATURE=6543e177be96fb685072546d230967b3

bgzip_canary_input() {
  awk 'BEGIN {
    s = 12345
    for (i = 1; i <= 60000; i++) {
      s = (s * 1103515245 + 12345) % 2147483648
      c = s % 24 + 1
      p = s % 250000000
      printf "chr%d\t%d\t%d\tfeat%d\t%d\t%s\n", c, p, p + (s % 5000), i, s % 1000, (s % 2 ? "+" : "-")
    }
  }'
}
export -f bgzip_canary_input

bgzip_toolchain_signature() {
  bgzip_canary_input | bgzip -c | md5sum | awk '{print $1}'
}
export -f bgzip_toolchain_signature

# Fatal rather than a warning, because the drift is invisible in the output.
# ALLOW_BGZIP_DRIFT=1 accepts a deliberate change, which means committing the
# new signature and re-sending every derived .gz and .csi.
assert_bgzip_toolchain() {
  if [ -n "${ALLOW_BGZIP_DRIFT:-}" ]; then
    echo "WARNING: ALLOW_BGZIP_DRIFT set; skipping bgzip toolchain check" >&2
    return 0
  fi
  if ! command -v bgzip >/dev/null 2>&1; then
    echo "ERROR: bgzip is not on PATH; nothing here can be derived without it." >&2
    return 1
  fi
  local actual
  actual=$(bgzip_toolchain_signature)
  if [ "$actual" != "$BGZIP_TOOLCHAIN_SIGNATURE" ]; then
    {
      echo "ERROR: bgzip emits different bytes than this corpus was built with."
      echo "  expected signature: $BGZIP_TOOLCHAIN_SIGNATURE"
      echo "  this bgzip:         $actual"
      echo "  bgzip in use:       $(command -v bgzip) ($(bgzip --version 2>&1 | head -1))"
      echo
      echo "Every derived .gz and .csi would be rewritten with identical content"
      echo "and re-uploaded. Usually a different htslib is first on PATH, or the"
      echo "same one was rebuilt against libz instead of libdeflate (or back)."
      echo
      echo "To accept it: re-run with ALLOW_BGZIP_DRIFT=1 and commit the new"
      echo "signature as BGZIP_TOOLCHAIN_SIGNATURE in lib/derive.sh."
    } >&2
    return 1
  fi
}
export -f assert_bgzip_toolchain
