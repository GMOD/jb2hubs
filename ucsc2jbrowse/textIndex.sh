#!/bin/bash
#
# textIndex.sh
#
# Builds the trix text index for each "<built dir>\t<trackIds>" line on stdin
# (what src/buildConfigs.ts prints for assemblies whose index is missing or
# older than the files it covers). Both of an assembly's indexed tracks go in
# one pass, because --tracks REPLACES the assembly's aggregate index rather
# than adding to it.
#
# `jbrowse text-index` reads the NCBI GFF track's indexing policy off its
# textSearching slot, so it has to run after the config is written; gene_synonym
# is what makes an old gene symbol findable on the golden-path track. It also
# rewrites config.json in its own layout, which formatConfigs.ts puts back.

set -euo pipefail

source "$(dirname "$0")/common.sh"

text_index() {
  set -eo pipefail
  local dir="$1" tracks="$2"
  jbrowse text-index --force --quiet --out "$dir" --tracks "$tracks" \
    --attributes Name,ID,gene_synonym >/dev/null
}
export -f text_index

INDEX_LIST=$(mktemp)
trap 'rm -f "$INDEX_LIST"' EXIT
cat >"$INDEX_LIST"

count=$(grep -c . "$INDEX_LIST" || true)
if [ "$count" -eq 0 ]; then
  echo "Every text index is current"
else
  echo "Text indexing $count assembly/assemblies..."
  # text-index is memory-hungry, so cap concurrency well below core count.
  run_parallel_reporting 'text index' -j8 --colsep '\t' text_index '{1}' '{2}' <"$INDEX_LIST"
  cut -f1 "$INDEX_LIST" | sed 's|$|/config.json|' | node src/formatConfigs.ts
fi
