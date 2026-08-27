#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

# Optional first arg: a file listing accessions (one per line) to restrict the
# work to. When omitted, every processed GFF under bgz/ is considered.
SCOPE_FILE="${1:-}"

# Reads a GFF on stdin and prints, per sequence, the dominant non-standard NCBI
# genetic code as "seqid<TAB>code". Pure (no I/O). The standard code (1) and
# sequences without a CDS transl_table are omitted, so the typical nuclear
# assembly produces no output at all.
extract_genetic_codes() {
  awk -F'\t' '
    $3 == "CDS" && match($9, /transl_table=[0-9]+/) {
      code = substr($9, RSTART + 13, RLENGTH - 13)
      count[$1 SUBSEP code]++
      seqids[$1] = 1
    }
    END {
      for (seqid in seqids) {
        best = ""
        best_count = 0
        for (key in count) {
          split(key, parts, SUBSEP)
          if (parts[1] == seqid && count[key] > best_count) {
            best_count = count[key]
            best = parts[2]
          }
        }
        if (best != "" && best != "1") {
          print seqid "\t" best
        }
      }
    }'
}

# Writes the per-sequence genetic codes into the assembly's geneticCodes map, so
# the reference sequence track's translation rows use the right code on organelle
# contigs (e.g. mitochondria, transl_table=2). Keyed by the GFF seqid; JBrowse
# resolves that to the assembly's canonical refName via refNameAliases (the
# chromAlias file) at runtime, so it works whether the refName is the accession
# or the UCSC-style name.
add_genetic_codes() {
  local gff_file_path="$1"
  local config_file="$2"
  local accession="$3"
  local codes
  codes=$(pigz -dc "$gff_file_path" | extract_genetic_codes)
  if [ -n "$codes" ]; then
    local map
    map=$(printf '%s\n' "$codes" |
      jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {(.[0]): (.[1] | tonumber)}) | add')
    local tmp
    tmp=$(mktemp)
    if jq --argjson gc "$map" '.assemblies[0].geneticCodes = $gc' "$config_file" >"$tmp"; then
      mv "$tmp" "$config_file"
      echo "Added geneticCodes for $accession: $(printf '%s' "$codes" | tr '\n' ' ')"
    else
      rm -f "$tmp"
      echo "Warning: geneticCodes update failed for $accession" >&2
    fi
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

  # last, so the in-place config rewrites above can't clobber it
  add_genetic_codes "$gff_file_path" "$config_file" "$accession"
}

# Export functions for use with GNU Parallel
export -f add_track_and_text_index
export -f add_genetic_codes
export -f extract_genetic_codes

# Skip when sourced (e.g. by the test script) so only the function
# definitions above are loaded.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  list_scoped_gz bgz "$SCOPE_FILE" | run_parallel_reporting 'GFF track+index' -j16 add_track_and_text_index
fi
