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

if [ "$changed" = 1 ]; then
  cloudfront_invalidate "/pangenome/*/config.json"
else
  echo "pangenome configs unchanged"
fi
