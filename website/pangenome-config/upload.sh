#!/bin/bash
# Publishes the pangenome graph configs to the jbrowse.org bucket. They live
# there, not on genomes.jbrowse.org, because jbrowse-web fetches `?config=` from
# the visitor's browser and our site sends no CORS headers; the bucket does.
#
# The stamp beside each file is a byte-exact copy of what was last uploaded
# (see upload_if_changed in lib/common.sh), so a run that changes nothing
# neither uploads nor invalidates. `.oxfmtrc.json` must keep ignoring the stamp.
set -euo pipefail
cd "$(dirname "$0")"
source ../../lib/common.sh

changed=0

# Sidecars FIRST, and the order is load-bearing rather than tidy. A config's
# assembly block names its `chrom.sizes` relatively, so jbrowse-web resolves it
# against the config's own url; a config published ahead of its sidecars names
# objects that 404, and `loadPre()` fetches sequence regions and aliases in one
# Promise.all, so one 404 fails the whole assembly rather than costing a track.
# The reverse order is inert: an uploaded sidecar nothing references yet.
#
# `<name>/` beside `<name>.json` is the directory of them, mirroring the bucket
# prefix the config is published under. The glob skips dotfiles, which is what
# keeps each sidecar's own stamp from being uploaded beside it.
for dir in */; do
  name="${dir%/}"
  [ -f "$name.json" ] || continue
  for f in "$name"/*; do
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    n=$(upload_if_changed "$f" "s3://jbrowse.org/pangenome/$name/$base" "$name/.$base-uploaded")
    if [ "$n" = 1 ]; then
      echo "uploaded $name/$base"
      changed=1
    fi
  done
done

for f in *.json; do
  name="${f%.json}"
  n=$(upload_if_changed "$f" "s3://jbrowse.org/pangenome/$name/config.json" ".$name-uploaded.json")
  if [ "$n" = 1 ]; then
    echo "uploaded $name"
    changed=1
  fi
done

# `/pangenome/*`, NOT `/pangenome/*/config.json`, and the difference is silent.
# CloudFront requires the `*` to be the LAST character of an invalidation path;
# a mid-path wildcard is accepted, reports Status: Completed, and matches
# nothing. Measured 2026-09-09: after the publish that fixed a 404 bovine config
# and a stale hprc one, the mid-path invalidation completed and the edge went on
# serving the previous hprc config for twenty minutes -- while the two configs
# that had never been cached read correctly, which is exactly the pattern that
# makes this look like propagation delay rather than a no-op. Every other
# `cloudfront_invalidate` call in this repo already uses a trailing wildcard.
#
# The wide path is now doing real work rather than costing nothing: the prefix
# holds the three configs plus the eight GBZ-lane chrom.sizes, and a stale
# cached sidecar beside a fresh config is the same desynchronization the
# two-phase rclone sync exists to prevent.
if [ "$changed" = 1 ]; then
  cloudfront_invalidate "/pangenome/*"
else
  echo "pangenome configs unchanged"
fi
