#!/bin/bash

#
# downloadNcbiGff.sh
#
# Downloads the source NCBI RefSeq GFF3 for each UCSC assembly listed in
# ncbiRefSeqAccessions.tsv and adds it as a <db>-ncbiRefSeqGff FeatureTrack.
#
# This is the full-resolution NCBI annotation (rich GFF3 gene -> mRNA -> CDS/exon
# structure), complementary to UCSC's own genePred-derived ncbiRefSeq tracks. The
# assembly's refNameAliases (UCSC chromAlias.txt) maps the GFF's RefSeq accession
# seqids (NC_000001.11) to UCSC names (chr1) at load time, so the GFF loads as-is
# with no seqid rewriting. Per-contig genetic codes are handled separately by
# addGeneticCodes.ts in the post-processing phase.
#
# Usage:
#   ./downloadNcbiGff.sh             # every db in ncbiRefSeqAccessions.tsv
#   ./downloadNcbiGff.sh hg38 mm39   # only the named dbs
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

GFF_DIR="$SCRIPT_DIR/gff"
ACC_TSV="$SCRIPT_DIR/ncbiRefSeqAccessions.tsv"
mkdir -p "$GFF_DIR"

# Restrict to dbs named on the command line, when any are given.
declare -A WANT
for a in "$@"; do
  WANT["$a"]=1
done

# Downloads, sorts, bgzips and indexes one assembly's NCBI RefSeq GFF, then adds
# it as a track and text-indexes it.
process_db() {
  local db="$1"
  local acc="$2"
  local config="$UCSC_BUILT_DIR/$db/config.json"
  local gff="$GFF_DIR/$db.gff.gz"
  local track_id="$db-ncbiRefSeqGff"

  if [ ! -f "$config" ]; then
    log "Skipping $db: no config.json (assembly not built)"
  else
    if [ ! -f "$gff.csi" ] || [ -n "${REPROCESS:-}" ]; then
      log "Downloading $db NCBI RefSeq GFF ($acc)..."
      local zip="$GFF_DIR/$db.ncbi_dataset.zip"
      local extract="$GFF_DIR/$db.ncbi_dataset"
      datasets download genome accession "$acc" --include gff3 --no-progressbar --filename "$zip"
      rm -rf "$extract"
      unzip -o "$zip" -d "$extract" >/dev/null
      jbrowse sort-gff "$extract/ncbi_dataset/data/$acc/genomic.gff" | bgzip -@4 >"$gff"
      tabix -C "$gff"
      rm -rf "$zip" "$extract"
    fi

    if grep -q "\"$track_id\"" "$config"; then
      log "$db GFF track already present, skipping add-track."
    else
      log "Adding $track_id track..."
      jbrowse add-track "$gff" --force --trackId "$track_id" \
        --name "NCBI RefSeq - RefSeq All (GFF)" \
        --category "Genes and Gene Predictions" \
        --out "$UCSC_BUILT_DIR/$db/" --load copy --indexFile "$gff.csi"

      log "Text-indexing $track_id..."
      jbrowse text-index --force --out "$UCSC_BUILT_DIR/$db" \
        --tracks "$track_id" --attributes Name,ID,Note
    fi
  fi
}

while IFS=$'\t' read -r db acc _assembly_name; do
  case "$db" in
  '' | '#'*) continue ;;
  esac
  if [ "$#" -gt 0 ] && [ -z "${WANT[$db]:-}" ]; then
    continue
  fi
  process_db "$db" "$acc"
done <"$ACC_TSV"

log "NCBI RefSeq GFF processing complete."
