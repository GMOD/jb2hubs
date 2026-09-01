#!/bin/bash
#
# textIndex.sh
#
# Builds the trix text index for each hub directory listed on stdin (the ones
# buildConfigsBatch.ts found without a current index). `jbrowse text-index` reads
# the indexing policy off the track's textSearching slot, so it has to run after
# the config is written; it also rewrites config.json in its own layout, which
# formatConfigs.ts puts back.

set -euo pipefail

source "$(dirname "$0")/common.sh"

text_index() {
  set -eo pipefail
  local hub_dir="$1"
  local accession
  accession=$(basename "$hub_dir")
  jbrowse text-index --force --quiet --out "$hub_dir" --tracks "${accession}-ncbiGff" >/dev/null
}
export -f text_index

INDEX_LIST=$(mktemp)
trap 'rm -f "$INDEX_LIST"' EXIT
cat >"$INDEX_LIST"

count=$(grep -c . "$INDEX_LIST" || true)
if [ "$count" -eq 0 ]; then
  echo "Every NCBI GFF track already has a current text index"
else
  echo "Text indexing $count NCBI GFF track(s)..."
  run_parallel_reporting 'text index' -j16 text_index <"$INDEX_LIST"
  sed 's|$|/config.json|' "$INDEX_LIST" | node src/formatConfigs.ts
fi
