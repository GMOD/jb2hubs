#!/bin/bash
# Keeps nodes.dmp, names.dmp and merged.dmp beside this script no older than
# MAX_AGE_DAYS. A failed refresh keeps a stale copy with a warning, and fails
# only when there is no copy at all.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAX_AGE_DAYS="${TAXDUMP_MAX_AGE_DAYS:-30}"
URL=https://ftp.ncbi.nlm.nih.gov/pub/taxonomy/taxdmp.zip
FILES=(nodes.dmp names.dmp merged.dmp)

have_all() {
  for f in "${FILES[@]}"; do
    [ -s "$DIR/$f" ] || return 1
  done
}

if have_all && [ -z "$(find "$DIR/nodes.dmp" -mtime +"$MAX_AGE_DAYS")" ]; then
  exit 0
fi

TMP="$(mktemp -d "$DIR/.taxdump.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading $URL" >&2
if curl -fsS --retry 3 --max-time 600 -o "$TMP/taxdmp.zip" "$URL" &&
  unzip -q -o "$TMP/taxdmp.zip" "${FILES[@]}" -d "$TMP"; then
  touch "${FILES[@]/#/$TMP/}"
  mv -f "${FILES[@]/#/$TMP/}" "$DIR/"
  echo "Taxonomy dump refreshed" >&2
elif have_all; then
  echo "WARNING: taxonomy dump refresh failed; keeping the copy from $(date -r "$DIR/nodes.dmp" +%F)" >&2
else
  echo "Could not download the taxonomy dump" >&2
  exit 1
fi
