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

# Prints the XXH3 hash of stdin. xxhsum 0.8.1 prints `XXH3 (stdin) = <hash>`
# and 0.8.2 `XXH3_<hash>  stdin`; the last field, which this used to take, is
# the name under 0.8.2, so every stamp stopped following content. Its stderr
# holds a carriage-return progress line with no flag to stop it, so it is
# dropped.
stdin_xxh3() {
  xxhsum -H3 2>/dev/null | awk '{
    for (i = 1; i <= NF; i++) {
      h = $i
      sub(/^XXH3_/, "", h)
      if (length(h) == 16 && h ~ /^[0-9a-f]+$/) { print h; exit }
    }
  }'
}
export -f stdin_xxh3

# Prints a file's XXH3 hash, failing when there is none. The file goes in on
# stdin, so no name in xxhsum's output can look like a hash.
file_xxh3() {
  local h
  h=$(stdin_xxh3 2>/dev/null <"$1") || return 1
  [ -n "$h" ] || return 1
  printf '%s\n' "$h"
}
export -f file_xxh3

# The stamp for one or more sources: their XXH3 hashes, space-separated, so one
# source's stamp is its bare hash.
sources_xxh3() {
  local f h hashes=()
  for f in "$@"; do
    h=$(file_xxh3 "$f") || return 1
    hashes+=("$h")
  done
  printf '%s\n' "${hashes[*]}"
}
export -f sources_xxh3

# Returns 0 (rebuild) when REPROCESS or REDERIVE is set, the output or stamp is
# missing, a source cannot be hashed, or the sources' hashes differ from the
# stamp. REDERIVE is the code half: the caller sets it when its derivation
# sources changed, since the stamp tracks only the source data. A derivation
# that reads several files names the rest after the stamp.
# Usage: if needs_rebuild out.bed.gz in.txt.gz out.hash [more.txt.gz...]; then ...; fi
needs_rebuild() {
  local output="$1" hash_file="$3" current stored
  if [ -n "${REPROCESS:-}" ] || [ -n "${REDERIVE:-}" ] ||
    [ ! -f "$output" ] || [ ! -f "$hash_file" ]; then
    return 0
  fi
  current=$(sources_xxh3 "$2" "${@:4}") || return 0
  read -r stored <"$hash_file" || return 0
  [ "$current" != "$stored" ]
}
export -f needs_rebuild

# Records the sources' hashes as the stamp needs_rebuild reads. Refuses when the
# output is missing or empty, or a source cannot be hashed: a recipe that exits
# 0 having written nothing would otherwise be skipped by every later run. The
# arguments match needs_rebuild's.
# Usage: save_rebuild_stamp out.bed.gz in.txt.gz out.hash [more.txt.gz...]
save_rebuild_stamp() {
  local output="$1" hash_file="$3" h
  if [ ! -s "$output" ]; then
    echo "save_rebuild_stamp: $output was not produced (or is empty); refusing to stamp $hash_file" >&2
    return 1
  fi
  if ! h=$(sources_xxh3 "$2" "${@:4}"); then
    echo "save_rebuild_stamp: could not hash $2 ${*:4}; refusing to stamp $hash_file" >&2
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

# Indexes the bgzipped temp file with tabix -C and replaces <out.gz> and its
# index with the pair. Writing <out.gz> in place let a tabix refusal leave the
# new data beside the old index, and wrote through any hard link to it.
# Identical bytes keep the installed pair and its mtime, so rclone's hasher
# cache still holds its MD5 and a forced rebuild re-reads nothing at upload.
install_indexed_gz() {
  local tmp="$1" out="$2" preset="$3"
  if [ -f "$out.csi" ] && cmp -s "$tmp" "$out"; then
    rm -f "$tmp"
    return 0
  fi
  if ! tabix -p "$preset" -C "$tmp"; then
    rm -f "$tmp" "$tmp.csi"
    return 1
  fi
  rm -f "$out.csi" "$out.tbi"
  mv "$tmp" "$out"
  mv "$tmp.csi" "$out.csi"
}

# Bgzips stdin into <out.gz> and indexes it, under a temp name. A pipe into this
# cannot see its producer die: bgzip reads a clean EOF and the partial file
# installs. Use write_indexed_gz_from when a producer feeds it.
# Usage: ... | write_indexed_gz <out.gz> <tabix preset: bed|gff>
write_indexed_gz() {
  local out="$1" preset="$2" tmp
  tmp="$(dirname "$out")/.tmp.$(basename "$out")"
  rm -f "$tmp" "$tmp.csi"
  if ! bgzip -@4 >"$tmp"; then
    rm -f "$tmp" "$tmp.csi"
    return 1
  fi
  install_indexed_gz "$tmp" "$out" "$preset"
}
export -f install_indexed_gz write_indexed_gz

# Runs the producer command, bgzips its stdout and installs the pair only when
# the producer and bgzip both succeed; a failure leaves the previous output.
# Usage: write_indexed_gz_from <out.gz> <tabix preset: bed|gff> <cmd> [args...]
write_indexed_gz_from() {
  local out="$1" preset="$2" tmp pipe_rc
  shift 2
  tmp="$(dirname "$out")/.tmp.$(basename "$out")"
  rm -f "$tmp" "$tmp.csi"
  "$@" | bgzip -@4 >"$tmp"
  pipe_rc=("${PIPESTATUS[@]}")
  if [ "${pipe_rc[0]}" -ne 0 ] || [ "${pipe_rc[1]}" -ne 0 ]; then
    rm -f "$tmp" "$tmp.csi"
    return 1
  fi
  install_indexed_gz "$tmp" "$out" "$preset"
}
export -f write_indexed_gz_from

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

# Every bgzip on PATH, then ~/.local/bin's, which a login shell puts first but
# a nohup or cron job does not; one path per build, so /bin and /usr/bin on a
# merged-/usr host count once
bgzip_candidates() {
  local path
  {
    type -ap bgzip || true
    [ ! -x "$HOME/.local/bin/bgzip" ] || echo "$HOME/.local/bin/bgzip"
  } | while IFS= read -r path; do
    printf '%s\t%s\n' "$(readlink -f "$path")" "$path"
  done | awk -F'\t' '!seen[$1]++ {print $2}'
}
export -f bgzip_candidates

# Fatal rather than a warning, because the drift is invisible in the output.
# Where the bgzip first on PATH emits other bytes, the first candidate that
# matches and has its htslib's tabix beside it goes first on PATH for the rest
# of the run. A candidate that fails to run counts as a mismatch.
# ALLOW_BGZIP_DRIFT=1 accepts a deliberate change, which means committing the
# new signature and re-sending every derived .gz and .csi.
assert_bgzip_toolchain() {
  if [ -n "${ALLOW_BGZIP_DRIFT:-}" ]; then
    echo "WARNING: ALLOW_BGZIP_DRIFT set; skipping bgzip toolchain check" >&2
    return 0
  fi
  if ! command -v bgzip >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/bgzip" ]; then
    echo "ERROR: bgzip is not on PATH; nothing here can be derived without it." >&2
    return 1
  fi
  local first actual candidate dir version tabix tried=''
  first=$(command -v bgzip || true)
  while IFS= read -r candidate <&3; do
    actual=$(bgzip_canary_input | "$candidate" -c 2>/dev/null | md5sum | awk '{print $1}') ||
      actual='failed to run'
    version=$("$candidate" --version </dev/null 2>&1 | head -1) || true
    dir=$(dirname "$candidate")
    if [ "$actual" != "$BGZIP_TOOLCHAIN_SIGNATURE" ]; then
      tried+="    $candidate ($version): $actual"$'\n'
      continue
    fi
    if [ "$candidate" != "$first" ]; then
      if [ ! -x "$dir/tabix" ]; then
        tried+="    $candidate ($version): matches, but $dir has no tabix"$'\n'
        continue
      fi
      PATH="$dir:$PATH"
      export PATH
      hash -r
      echo "NOTE: using $candidate, the bgzip the corpus was built with, not ${first:-none}" >&2
    fi
    tabix=$(command -v tabix || true)
    if [ "$(dirname "${tabix:-/none/tabix}")" != "$dir" ]; then
      echo "WARNING: tabix is ${tabix:-missing}, not beside $candidate, so its indexes may differ from the corpus's" >&2
    fi
    return 0
  done 3< <(bgzip_candidates)
  {
    echo "ERROR: no bgzip emits the bytes this corpus was built with."
    echo "  expected signature: $BGZIP_TOOLCHAIN_SIGNATURE"
    echo "  tried:"
    printf '%s' "$tried"
    echo
    echo "Every derived .gz and .csi would be rewritten with identical content"
    echo "and re-uploaded. Usually the matching htslib is missing from PATH, or it"
    echo "was rebuilt against libz instead of libdeflate (or back)."
    echo
    echo "To accept it: re-run with ALLOW_BGZIP_DRIFT=1 and commit the new"
    echo "signature as BGZIP_TOOLCHAIN_SIGNATURE in lib/derive.sh."
  } >&2
  return 1
}
export -f assert_bgzip_toolchain
