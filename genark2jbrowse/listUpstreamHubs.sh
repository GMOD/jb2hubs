#!/bin/bash
#
# listUpstreamHubs.sh <out.tsv>
#
# Every GenArk hub.txt on hgdownload, as "accession<TAB>size<TAB>mtime", from
# one rsync --list-only walk per accession prefix. The include chain descends
# exactly four directory levels (GCA/000/001/905/GCA_000001905.1/) and names
# hub.txt there, so rsync never enters bbi/ or html/. Two connections answer
# what 52,000 HEAD requests would: which hubs changed upstream, and which are
# gone. mtime is as rsync prints it, in this host's local time.
#
# Exits non-zero, writing nothing, when the walk comes back implausibly short:
# a truncated listing would read as "every hub retired".

set -euo pipefail

out=$1
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

for prefix in GCA GCF; do
  rsync --list-only -r \
    --include='/*/' --include='/*/*/' --include='/*/*/*/' --include='/*/*/*/*/' \
    --include='/*/*/*/*/hub.txt' --exclude='*' \
    "rsync://hgdownload.soe.ucsc.edu/hubs/$prefix/" |
    awk '$NF ~ /\/hub\.txt$/ {
      n = split($NF, a, "/")
      size = $2; gsub(",", "", size)
      print a[n - 1] "\t" size "\t" $3 " " $4
    }'
done | sort >"$tmp"

count=$(wc -l <"$tmp")
if [ "$count" -lt 10000 ]; then
  echo "listUpstreamHubs: only $count hub.txt entries listed; refusing to use it" >&2
  exit 1
fi
mv "$tmp" "$out"
trap - EXIT
echo "listUpstreamHubs: $count hub.txt files upstream" >&2
