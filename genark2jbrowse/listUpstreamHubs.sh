#!/bin/bash
#
# listUpstreamHubs.sh <out.tsv>
#
# Every GenArk hub's top-level files on hgdownload, as
# "accession<TAB>file<TAB>size<TAB>mtime", from one rsync --list-only walk per
# accession prefix. The include chain descends exactly four directory levels
# (GCA/000/001/905/GCA_000001905.1/) and names hub.txt, the 2bit and the
# chrom.sizes there, so rsync never enters bbi/. Two connections answer what
# 150,000 HEAD requests would: which hubs changed upstream, which are gone, and
# which have lost the sequence files their config's assembly names. mtime is
# as rsync prints it, in this host's local time.
#
# Exits non-zero, writing nothing, when the walk comes back implausibly short:
# a truncated listing would read as "every hub retired".

set -euo pipefail

# rsync --list-only lines ("-rw-rw-r-- 13,636 2026/07/20 15:27:21 001/905/GCA_000001905.1/hub.txt")
# to TSV rows, dropping directories.
parse_rsync_listing() {
  awk '$1 ~ /^-/ && $NF ~ /\// {
    n = split($NF, a, "/")
    size = $2; gsub(",", "", size)
    print a[n - 1] "\t" a[n] "\t" size "\t" $3 " " $4
  }'
}

# Fails when fewer than 10,000 hub.txt rows are present.
check_listing_count() {
  local count
  count=$(cut -f2 "$1" | grep -c '^hub\.txt$' || true)
  if [ "$count" -lt 10000 ]; then
    echo "listUpstreamHubs: only $count hub.txt entries listed; refusing to use it" >&2
    return 1
  fi
  echo "listUpstreamHubs: $count hub.txt files upstream" >&2
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  out=$1
  tmp=$(mktemp)
  trap 'rm -f "$tmp"' EXIT

  for prefix in GCA GCF; do
    rsync --list-only -r \
      --include='/*/' --include='/*/*/' --include='/*/*/*/' --include='/*/*/*/*/' \
      --include='/*/*/*/*/hub.txt' --include='/*/*/*/*/*.2bit' \
      --include='/*/*/*/*/*.chrom.sizes.txt' --exclude='*' \
      "rsync://hgdownload.soe.ucsc.edu/hubs/$prefix/" | parse_rsync_listing
  done | sort >"$tmp"

  check_listing_count "$tmp"
  mv "$tmp" "$out"
  trap - EXIT
fi
