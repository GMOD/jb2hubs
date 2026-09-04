#!/bin/bash
#
# listUpstreamHubs.test.sh
#
# Tests for the network-free halves of listUpstreamHubs.sh: rsync's listing
# format to TSV, the refusal of a short listing, and which shape
# list_upstream_hubs picks -- including the fall back to the walk, which is the
# only reason the walk is still here.
# Run: ./listUpstreamHubs.test.sh
#

set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/listUpstreamHubs.sh"

fail=0
check() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "ok   - $desc"
  else
    echo "FAIL - $desc"
    echo "       expected: $expected"
    echo "       actual:   $actual"
    fail=1
  fi
}

# Captured from rsync --list-only -r over hubs/GCA/000/ on 2026-09-01.
listing='drwxrwsr-x          4,096 2026/07/20 15:27:21 001
drwxrwsr-x          4,096 2026/07/20 15:27:21 001/905
drwxrwsr-x          4,096 2026/07/20 15:27:21 001/905/GCA_000001905.1
-rw-rw-r--         13,636 2026/07/20 15:27:21 001/905/GCA_000001905.1/hub.txt
-rw-rw-r--    240,876,143 2024/10/03 11:12:40 001/905/GCA_000001905.1/GCA_000001905.1.2bit
-rw-rw-r--          3,301 2024/10/03 11:12:40 001/905/GCA_000001905.1/GCA_000001905.1.chrom.sizes.txt
-rw-rw-r--          5,787 2026/07/20 15:27:26 001/985/GCA_000001985.1/hub.txt'

expected='GCA_000001905.1	hub.txt	13636	2026/07/20 15:27:21
GCA_000001905.1	GCA_000001905.1.2bit	240876143	2024/10/03 11:12:40
GCA_000001905.1	GCA_000001905.1.chrom.sizes.txt	3301	2024/10/03 11:12:40
GCA_000001985.1	hub.txt	5787	2026/07/20 15:27:26'
got=$(printf '%s\n' "$listing" | parse_rsync_listing)
check "parse_rsync_listing keys files by accession, strips size commas, drops directories" \
  "$expected" "$got"

# rsync prints the module's own "." entry and sender-side chatter on stdout;
# neither is a file under an accession.
got=$(printf 'drwxrwsr-x 4,096 2026/07/20 15:27:21 .\nreceiving file list ... done\n' | parse_rsync_listing)
check "parse_rsync_listing ignores the root entry and rsync chatter" "" "$got"

short=$(mktemp)
printf 'GCA_000001905.1\thub.txt\t13636\t2026/07/20 15:27:21\n' >"$short"
if check_listing_count "$short" 2>/dev/null; then
  check "check_listing_count refuses a short listing" "refused" "accepted"
else
  check "check_listing_count refuses a short listing" "refused" "refused"
fi

full=$(mktemp)
for i in $(seq 1 10000); do
  printf 'GCA_%09d.1\thub.txt\t1\t2026/07/20 15:27:21\nGCA_%09d.1\tGCA_%09d.1.2bit\t1\t2026/07/20 15:27:21\n' "$i" "$i" "$i"
done >"$full"
if check_listing_count "$full" 2>/dev/null; then
  check "check_listing_count counts hub.txt rows only, and accepts 10,000" "accepted" "accepted"
else
  check "check_listing_count counts hub.txt rows only, and accepts 10,000" "accepted" "refused"
fi
rm -f "$short" "$full"

# The dispatch, with both shapes and the manifest stubbed out. What matters is
# which one runs, not what it prints.
walk_upstream_hubs() { echo WALKED; }
stat_upstream_paths() { echo "STATTED $(ls "$1" | wc -l) chunks, $(cat "$1"/* | wc -l) paths"; }
work=$(mktemp -d)

genark_candidate_paths() { seq 1 8000 >"$2"; }
check "a usable manifest is statted, split into chunks of $STAT_CHUNK" \
  "STATTED 2 chunks, 8000 paths" "$(HUB_LIST_MODE= list_upstream_hubs "$work" 2>/dev/null)"

check "HUB_LIST_MODE=walk takes the walk with the manifest available" \
  "WALKED" "$(HUB_LIST_MODE=walk list_upstream_hubs "$work" 2>/dev/null)"

rm -rf "${work:?}"/*
genark_candidate_paths() { return 1; }
check "an unfetchable manifest falls back to the walk" \
  "WALKED" "$(HUB_LIST_MODE= list_upstream_hubs "$work" 2>/dev/null)"

# A truncated manifest is the dangerous one: it reads as a corpus that shrank.
fetch_genark_file_list() { : >"$1"; }
genark_candidate_paths() {
  fetch_genark_file_list "$1" && seq 1 100 >"$2" && [ "$(wc -l <"$2")" -ge 30000 ]
}
check "a short manifest falls back to the walk rather than retiring every hub" \
  "WALKED" "$(HUB_LIST_MODE= list_upstream_hubs "$work" 2>/dev/null)"

rm -rf "$work"

exit $fail
