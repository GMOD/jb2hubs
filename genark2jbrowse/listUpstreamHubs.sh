#!/bin/bash
#
# listUpstreamHubs.sh <out.tsv>
#
# Every GenArk hub's top-level files on hgdownload, as
# "accession<TAB>file<TAB>size<TAB>mtime" -- hub.txt, the 2bit and the
# chrom.sizes. Two connections answer what 150,000 HEAD requests would: which
# hubs changed upstream, which are gone, and which have lost the sequence files
# their config's assembly names. mtime is as rsync prints it, in this host's
# local time.
#
# Two shapes produce that file, and both are here:
#
#   stat (default)  hgdownload publishes genArkFileList.txt.gz, a manifest of
#                   every path under hubs/GCA and hubs/GCF, so the accessions
#                   are known without walking anything and rsync is asked to
#                   stat only the ~158,000 paths we actually read. ~12s.
#   walk            the original: two rsync --list-only -r traversals whose
#                   include chain descends exactly four levels, so rsync never
#                   enters bbi/. ~10 minutes. Kept because it needs nothing
#                   from upstream but the rsync daemon itself -- run it with
#                   HUB_LIST_MODE=walk, and the default falls back to it on its
#                   own when the manifest cannot be fetched or reads short.
#
# Why the default is no longer the walk, measured 2026-09-04: the traversal's
# cost is hgdownload reading ~110,000 directories it then discards, and it is
# almost entirely cache-bound -- the same GCA walk is 68.8s cold against 1.85s
# warm, 37x, with 0.49s of that on our side. Statting named paths does not pay
# that and is barely cache-sensitive at all: the same GCF/002 stat is 0.547s
# cold against 0.532s warm. Whole corpus, 158,238 paths: 12s against 631s.
# Parallelising the walk was measured too and is not the answer -- four
# concurrent cold walks moved 188 hubs/s against 117 single-stream, ~1.2x for
# 3x the connections, because the server is throughput-bound, not latency-bound.
#
# Exits non-zero, writing nothing, when the result comes back implausibly
# short: a truncated listing would read as "every hub retired".

set -euo pipefail

RSYNC_HUBS=rsync://hgdownload.soe.ucsc.edu/hubs/
GENARK_FILE_LIST=https://hgdownload.soe.ucsc.edu/hubs/genArkFileList.txt.gz

# rsync's --files-from handling is quadratic in the length of the list: the
# whole corpus in one call spends 74.8s of *client* CPU, the same paths in
# chunks of 4,000 spend 8s of wall clock in total.
STAT_CHUNK=4000

# rsync --list-only lines ("-rw-rw-r-- 13,636 2026/07/20 15:27:21 001/905/GCA_000001905.1/hub.txt")
# to TSV rows, dropping directories. Both shapes below print the same format;
# only the leading path components differ, and just the last two are read.
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

# The original traversal, one connection per accession prefix. Superseded by
# stat_upstream_paths but kept working: if UCSC stops regenerating
# genArkFileList.txt.gz, or moves it, this is what still answers.
walk_upstream_hubs() {
  local prefix
  for prefix in GCA GCF; do
    rsync --list-only -r \
      --include='/*/' --include='/*/*/' --include='/*/*/*/' --include='/*/*/*/*/' \
      --include='/*/*/*/*/hub.txt' --include='/*/*/*/*/*.2bit' \
      --include='/*/*/*/*/*.chrom.sizes.txt' --exclude='*' \
      "$RSYNC_HUBS$prefix/" | parse_rsync_listing
  done
}

# size and mtime for the candidate paths in $1, a chunk per connection.
# --ignore-missing-args is what makes a candidate that is not there simply
# absent from the output instead of an error, which is the whole point: absence
# is the answer downloadHubs.ts reads as "gone upstream".
stat_upstream_paths() {
  local chunk
  for chunk in "$1"/*; do
    rsync --list-only -t --ignore-missing-args --files-from="$chunk" \
      "$RSYNC_HUBS" . | parse_rsync_listing
  done
}

fetch_genark_file_list() {
  curl -fsS --max-time 300 -o "$1" "$GENARK_FILE_LIST"
}

# Writes the paths to stat to $2, or fails when the manifest cannot be used at
# all -- unfetchable, unparseable, or naming so few hubs that it is a truncated
# copy rather than a shrinking corpus.
genark_candidate_paths() {
  fetch_genark_file_list "$1" &&
    node src/upstreamHubCandidates.ts "$1" >"$2" &&
    [ "$(wc -l <"$2")" -ge 30000 ]
}

# The TSV rows, from whichever shape can answer. $1 is a scratch directory.
list_upstream_hubs() {
  local work=$1
  if [ "${HUB_LIST_MODE:-stat}" != stat ]; then
    walk_upstream_hubs
  elif genark_candidate_paths "$work/genArkFileList.txt.gz" "$work/paths"; then
    mkdir -p "$work/chunks"
    split -l "$STAT_CHUNK" "$work/paths" "$work/chunks/c"
    stat_upstream_paths "$work/chunks"
  else
    echo "listUpstreamHubs: genArkFileList.txt.gz unusable, falling back to the rsync walk" >&2
    walk_upstream_hubs
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  out=$1
  cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT

  # lib/common.sh exports this for every node call in the pipeline, but this
  # script is deliberately sourceable on its own, so it sets its own.
  export NODE_OPTIONS="--experimental-strip-types --no-warnings=ExperimentalWarning"

  list_upstream_hubs "$work" | sort >"$work/tsv"
  check_listing_count "$work/tsv"
  mv "$work/tsv" "$out"
fi
