#!/bin/bash
#
# common.test.sh
#
# Tests for helpers in common.sh (currently make_file_listing).
# Run: ./common.test.sh
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
hash_of() { grep -F "($1)" "$2" | sed -E 's/.* = ([0-9a-f]+)$/\1/'; }

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
dupes=$(tail -n +2 "$listing" | sed -E 's/^XXH3 \((.*)\) = .*/\1/' | sort | uniq -d)
check "no duplicate path entries" "" "$dupes"

rm -rf "$work"

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

rm -rf "$rb"

[[ $fail -eq 0 ]] && echo "All tests passed" || echo "Some tests failed"
exit $fail
