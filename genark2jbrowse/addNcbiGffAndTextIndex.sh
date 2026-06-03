#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

# Optional first arg: a file listing accessions (one per line) to restrict the
# work to. When omitted, every processed GFF under bgz/ is considered.
SCOPE_FILE="${1:-}"

# Lists the bgz GFFs to add: either every file under bgz/, or just those
# belonging to the scoped accessions.
list_bgz_inputs() {
  if [ -n "$SCOPE_FILE" ]; then
    while IFS= read -r acc; do
      [ -n "$acc" ] || continue
      for f in bgz/"$acc"_*.gz; do
        if [ -f "$f" ]; then
          echo "$f"
        fi
      done
    done <"$SCOPE_FILE"
  else
    find bgz -name "*.gz"
  fi
}

# Define function to add a GFF track to a JBrowse 2 assembly and create a text index.
add_track_and_text_index() {
  local gff_file_path="$1"
  local filename
  filename=$(basename "$gff_file_path")
  local accession
  accession=$(echo "$filename" | cut -d'_' -f1,2) # e.g., GCF_000896435.1
  local hub_dir
  hub_dir=$(accession_to_hub_dir "$accession")
  local config_file="$hub_dir/config.json"

  if [ ! -f "$config_file" ]; then
    local reason="unknown"
    if [ ! -f "$hub_dir/meta.json" ]; then
      reason="meta.json missing"
    elif [ ! -f "$hub_dir/hub.txt" ]; then
      reason="hub.txt missing"
    else
      reason="config generation may have failed"
    fi
    echo "Skipping $accession: no config.json at $hub_dir ($reason)"
    return 0
  fi

  if ! jbrowse add-track --force "$gff_file_path" --out "$hub_dir" --load copy --indexFile "${gff_file_path}".csi --trackId "${accession}-ncbiGff" --name "NCBI RefSeq - RefSeq All (GFF)" --category "Genes and Gene Predictions" >/dev/null; then
    echo "Warning: add-track failed for $accession" >&2
    return
  fi
  # Reuse the existing trix index only when it is present and not older than the
  # current GFF; a newer GFF (an in-place re-annotation pulled by FETCH_UPDATES)
  # or any reprocess flag forces a fresh text-index.
  local trix_ix="$hub_dir/trix/${accession}.ix"
  if [ -d "$hub_dir/trix" ] && [ -f "$trix_ix" ] && [ ! "$gff_file_path" -nt "$trix_ix" ] && [ -z "${REPROCESS:-}" ]; then
    add_trix_adapter "$accession" "$config_file"
  else
    echo "Trix index missing or reprocessing requested for $accession, running jbrowse text-index"

    jbrowse text-index --force --out "$hub_dir" --tracks "${accession}-ncbiGff" --attributes Name,ID,Note || echo "Warning: text-index failed for $accession" >&2
  fi
}

# Export function for use with GNU Parallel
export -f add_track_and_text_index

list_bgz_inputs | parallel -j16 $PARALLEL_OPTS add_track_and_text_index || true
