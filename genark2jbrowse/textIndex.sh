#!/bin/bash
#
# textIndex.sh
#
# Builds the trix text index for each "<hub dir>\t<stamp>" line on stdin (the
# hubs buildConfigsBatch.ts found without a current index). `jbrowse text-index`
# reads the indexing policy off the track's textSearching slot, so it has to run
# after the config is written; it also rewrites config.json in its own layout,
# which formatConfigs.ts puts back. The stamp goes to trix/indexed.hash only
# once the index is written, so a failed job is retried on the next run.

set -euo pipefail

source "$(dirname "$0")/common.sh"

text_index() {
  set -eo pipefail
  local hub_dir="$1" stamp="$2"
  local accession
  accession=$(basename "$hub_dir")
  "$JBROWSE_CLI" text-index --force --quiet --out "$hub_dir" --tracks "${accession}-ncbiGff" >/dev/null
  if [ -s "$hub_dir/trix/$accession.ix" ]; then
    printf '%s\n' "$stamp" >"$hub_dir/trix/indexed.hash"
  else
    echo "text_index: $hub_dir/trix/$accession.ix was not written; leaving it unstamped" >&2
    return 1
  fi
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
  run_parallel_reporting --refuse-if-all-fail 'text index' -j16 --colsep '\t' text_index '{1}' '{2}' <"$INDEX_LIST"
  cut -f1 "$INDEX_LIST" | sed 's|$|/config.json|' |
    node "$(dirname "$0")/../scripts/formatConfigs.ts"
fi
