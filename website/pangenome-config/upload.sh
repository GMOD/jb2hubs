#!/bin/bash
# Publishes the pangenome graph configs to the jbrowse.org bucket. They live
# there, not on genomes.jbrowse.org, because jbrowse-web fetches `?config=` from
# the visitor's browser and our site sends no CORS headers; the bucket does.
#
# The stamp beside each config is a byte-exact copy of what was last uploaded
# (see upload_if_changed in lib/common.sh), so a run that changes nothing
# neither uploads nor invalidates. `.oxfmtrc.json` must keep ignoring the stamp.
set -euo pipefail
cd "$(dirname "$0")"
source ../../lib/common.sh

changed=0
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
# Nothing else lives under this prefix (four objects, all config.json), so the
# wider path costs nothing.
if [ "$changed" = 1 ]; then
  cloudfront_invalidate "/pangenome/*"
else
  echo "pangenome configs unchanged"
fi
