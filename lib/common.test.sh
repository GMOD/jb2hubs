#!/bin/bash
#
# lib/common.test.sh
#
# Tests for helpers in lib/common.sh: make_file_listing, parse_flags, needs_rebuild
# / save_rebuild_stamp, source_tree_hash, and rclone_sync_with_indexes.
# Run: ./lib/common.test.sh
#

set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

fail=0
check() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "ok   - $desc"
  else
    echo "FAIL - $desc (expected '$expected', got '$actual')"
    fail=1
  fi
}

count_entries() { tail -n +2 "$1" 2>/dev/null | grep -c . || true; }
hash_of() { awk -F'\t' -v p="$1" '$2 == p {print $1}' "$2"; }

work=$(mktemp -d)
data="$work/data"
listing="$work/listing.txt"
mkdir -p "$data"

# Initial build hashes every file.
echo a >"$data/a.txt"
echo b >"$data/b.txt"
make_file_listing "$listing" "$data"
check "initial build hashes all files" 2 "$(count_entries "$listing")"

# A re-run with nothing changed must preserve every entry (the old two-pass
# awk wiped the listing whenever no file was newer than it).
make_file_listing "$listing" "$data"
check "unchanged re-run preserves entries" 2 "$(count_entries "$listing")"

# Regression: a write-once file older than the listing must still be recorded.
# The previous implementation only added files -newer than the listing, so a
# pre-existing data file like this was silently dropped.
echo c >"$data/c.txt"
touch -d '2000-01-01' "$data/c.txt"
make_file_listing "$listing" "$data"
check "older write-once file gets added" 3 "$(count_entries "$listing")"

# Deletion is reflected.
rm "$data/a.txt"
make_file_listing "$listing" "$data"
check "deleted file is removed" 2 "$(count_entries "$listing")"

# Modification re-hashes the file.
before=$(hash_of "$data/b.txt" "$listing")
echo bbbb >"$data/b.txt"
make_file_listing "$listing" "$data"
after=$(hash_of "$data/b.txt" "$listing")
if [[ -n "$after" && "$before" != "$after" ]]; then
  echo "ok   - modified file is re-hashed"
else
  echo "FAIL - modified file not re-hashed (before='$before' after='$after')"
  fail=1
fi

# No duplicate entries for any path.
dupes=$(tail -n +2 "$listing" | cut -f2- | sort | uniq -d)
check "no duplicate path entries" "" "$dupes"

# A path containing spaces stays on one row and round-trips through the merge.
echo spaced >"$data/has space.txt"
make_file_listing "$listing" "$data"
check "path with spaces is recorded" 3 "$(count_entries "$listing")"
spaced_hash=$(hash_of "$data/has space.txt" "$listing")
make_file_listing "$listing" "$data"
check "path with spaces survives a re-run" "$spaced_hash" "$(hash_of "$data/has space.txt" "$listing")"

# A listing in a retired format is rebuilt from scratch rather than merged.
printf '# algo=xxh3\nXXH3 (%s) = deadbeef\n' "$data/b.txt" >"$listing"
make_file_listing "$listing" "$data"
check "stale-format listing is rebuilt" 3 "$(count_entries "$listing")"
check "stale-format listing gets the new header" "# algo=xxh3-tsv" "$(head -1 "$listing")"

# An empty directory empties the listing instead of preserving stale rows.
rm -f "$data"/*
make_file_listing "$listing" "$data"
check "empty directory yields an empty listing" 0 "$(count_entries "$listing")"

# A missing directory is refused, leaving the previous listing untouched.
echo keep >"$data/keep.txt"
make_file_listing "$listing" "$data"
before_missing=$(cat "$listing")
if make_file_listing "$listing" "$work/not-a-dir" 2>/dev/null; then
  echo "FAIL - missing directory should return non-zero"
  fail=1
else
  echo "ok   - missing directory returns non-zero"
fi
check "missing directory preserves the listing" "$before_missing" "$(cat "$listing")"

rm -rf "$work"

# --- parse_flags ---

USAGE="Usage: fake [OPTIONS]"
handle_flag() {
  case "$1" in
  --extra) EXTRA=true ;;
  *) return 1 ;;
  esac
}

# Each case runs in a subshell: parse_flags exits the shell on --help and on an
# unknown flag, and exports REPROCESS.
probe_flags() (
  PROCESS_ALL=false EXTRA=false
  parse_flags "$@"
  echo "all=$PROCESS_ALL extra=$EXTRA reprocess=${REPROCESS:-}"
)

check "no flags leaves everything off" "all=false extra=false reprocess=" "$(probe_flags)"
check "--all sets PROCESS_ALL" "all=true extra=false reprocess=" "$(probe_flags --all)"
check "--reprocess-all implies --all" "all=true extra=false reprocess=true" "$(probe_flags --reprocess-all)"
check "script-specific flags reach handle_flag" "all=false extra=true reprocess=" "$(probe_flags --extra)"
check "flags compose" "all=true extra=true reprocess=true" "$(probe_flags --extra --reprocess-all)"

(probe_flags --nope) >/dev/null 2>&1
check "unknown flag exits non-zero" "1" "$?"
check "unknown flag reports on stderr" "Unknown option: --nope" \
  "$( (probe_flags --nope) 2>&1 >/dev/null | head -1)"

help_out=$( (probe_flags --help) 2>/dev/null)
check "--help prints the caller's usage" "Usage: fake [OPTIONS]" "$(echo "$help_out" | head -1)"
case "$help_out" in
*--reprocess-all*FETCH_UPDATES*)
  echo "ok   - --help appends the shared flag and env-var help"
  ;;
*)
  echo "FAIL - --help omitted the shared help block"
  fail=1
  ;;
esac

unset -f handle_flag
unset USAGE

# --- needs_rebuild / save_rebuild_stamp ---

rb=$(mktemp -d)
src="$rb/in.txt.gz"
out="$rb/out.bed.gz"
hash="$rb/out.hash"
printf 'aaaa' >"$src" # 4-byte source

# No output yet -> needs rebuild.
if needs_rebuild "$out" "$src" "$hash"; then echo "ok   - rebuild when output missing"; else
  echo "FAIL - rebuild when output missing"
  fail=1
fi

# Output + matching stamp -> no rebuild.
touch "$out"
save_rebuild_stamp "$src" "$hash"
if needs_rebuild "$out" "$src" "$hash"; then
  echo "FAIL - skip when stamp matches"
  fail=1
else echo "ok   - skip when stamp matches"; fi

# Source changes size -> needs rebuild.
printf 'aaaaaaaa' >"$src"
if needs_rebuild "$out" "$src" "$hash"; then echo "ok   - rebuild when source size changes"; else
  echo "FAIL - rebuild when source size changes"
  fail=1
fi

# Same byte size but different content -> needs rebuild. Byte-size stamping
# missed this; the XXH3 content hash catches it.
printf 'bbbbbbbb' >"$src"
save_rebuild_stamp "$src" "$hash"
printf 'cccccccc' >"$src" # still 8 bytes, different content
if needs_rebuild "$out" "$src" "$hash"; then echo "ok   - rebuild when content changes at identical size"; else
  echo "FAIL - rebuild when content changes at identical size"
  fail=1
fi

# REPROCESS forces rebuild even when the stamp matches.
save_rebuild_stamp "$src" "$hash"
if REPROCESS=1 needs_rebuild "$out" "$src" "$hash"; then echo "ok   - rebuild when REPROCESS set"; else
  echo "FAIL - rebuild when REPROCESS set"
  fail=1
fi

# Missing hash file -> needs rebuild.
rm -f "$hash"
if needs_rebuild "$out" "$src" "$hash"; then echo "ok   - rebuild when hash file missing"; else
  echo "FAIL - rebuild when hash file missing"
  fail=1
fi

# REDERIVE forces a rebuild even when the source stamp matches: the stamp tracks
# the source data only, so it cannot see a change in the code deriving the file.
# Skipping here is what left dm6/droPer1's gff.gz holding raw carriage returns
# after encodeGffAttribute was fixed, since their tables had not moved.
printf 'stable' >"$src"
save_rebuild_stamp "$src" "$hash"
if needs_rebuild "$out" "$src" "$hash"; then
  echo "FAIL - skip when stamp matches and REDERIVE unset"
  fail=1
else
  echo "ok   - skip when stamp matches and REDERIVE unset"
fi
if REDERIVE=1 needs_rebuild "$out" "$src" "$hash"; then echo "ok   - rebuild when REDERIVE set"; else
  echo "FAIL - rebuild when REDERIVE set"
  fail=1
fi

rm -rf "$rb"

# --- rclone_sync_with_indexes ---
# Stub rclone so the test is hermetic. count_rclone_changes counts one line per
# changed object; the helper runs rclone twice (data phase + index phase), so the
# reported total is double the stub's per-call count. stdout must be exactly that
# total, with verbose rclone output kept off stdout.
rc=$(mktemp -d)
cat >"$rc/rclone" <<'STUB'
#!/bin/bash
echo "2024/01/01 INFO  : file1.gz: Copied (new)"
echo "2024/01/01 INFO  : file2.gz: Copied (replaced existing)"
echo "2024/01/01 INFO  : old.gz: Deleted"
echo "verbose noise that must not reach stdout" >&2
STUB
chmod +x "$rc/rclone"

out=$(PATH="$rc:$PATH" rclone_sync_with_indexes src: dest: --exclude '*.hash' 2>/dev/null)
check "rclone_sync_with_indexes sums data+index changes" 6 "$out"

cat >"$rc/rclone" <<'STUB'
#!/bin/bash
echo "2024/01/01 INFO  : There was nothing to transfer"
STUB
chmod +x "$rc/rclone"

out=$(PATH="$rc:$PATH" rclone_sync_with_indexes src: dest: 2>/dev/null)
check "rclone_sync_with_indexes reports 0 when nothing changed" 0 "$out"

rm -rf "$rc"

# --- source_tree_hash ---
# This is the stamp that makes a converter change invalidate built configs, so
# every property below is load-bearing: a miss ships stale output silently, and
# a spurious change reprocesses hundreds of assemblies for nothing.
st=$(mktemp -d)
mkdir -p "$st/src/nested" "$st/data"
echo one >"$st/src/a.ts"
echo two >"$st/src/nested/b.ts"
echo three >"$st/data/c.json"

base=$(source_tree_hash "$st" src data)
check "stable across runs" "$base" "$(source_tree_hash "$st" src data)"

# The whole point: an edit anywhere in the tree changes the hash.
echo edited >"$st/src/nested/b.ts"
if [[ "$base" != "$(source_tree_hash "$st" src data)" ]]; then
  echo "ok   - content edit changes the hash"
else
  echo "FAIL - content edit changes the hash"
  fail=1
fi
echo two >"$st/src/nested/b.ts"
check "reverting an edit restores the hash" "$base" "$(source_tree_hash "$st" src data)"

# Paths are hashed too, so moving a file is a change even when no byte of any
# file differs -- which for a converter it is.
mv "$st/src/a.ts" "$st/src/renamed.ts"
if [[ "$base" != "$(source_tree_hash "$st" src data)" ]]; then
  echo "ok   - rename changes the hash"
else
  echo "FAIL - rename changes the hash"
  fail=1
fi
mv "$st/src/renamed.ts" "$st/src/a.ts"

# Tests cannot change what a build emits; reprocessing every assembly because a
# test file moved would be pure cost.
echo t >"$st/src/a.test.ts"
check "test files are excluded" "$base" "$(source_tree_hash "$st" src data)"
rm "$st/src/a.test.ts"

# Keyed on paths relative to the root, so a different checkout location (or the
# same tree copied elsewhere) produces the same stamp.
st2=$(mktemp -d)
cp -r "$st/src" "$st/data" "$st2/"
check "same tree at another path hashes the same" "$base" "$(source_tree_hash "$st2" src data)"
rm -rf "$st2"

# A path that does not exist must fail loudly. Silently contributing nothing is
# how a renamed source directory would drop out of the stamp and start shipping
# stale configs again.
if source_tree_hash "$st" src nonexistent >/dev/null 2>&1; then
  echo "FAIL - missing path is an error"
  fail=1
else
  echo "ok   - missing path is an error"
fi

# An empty tree still yields a hash rather than an empty string (an empty stamp
# would compare equal to a missing stamp file).
mkdir -p "$st/empty"
if [[ -n "$(source_tree_hash "$st" empty)" ]]; then
  echo "ok   - empty tree still yields a hash"
else
  echo "FAIL - empty tree still yields a hash"
  fail=1
fi

rm -rf "$st"

[[ $fail -eq 0 ]] && echo "All tests passed" || echo "Some tests failed"
exit $fail
