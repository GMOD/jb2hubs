#!/bin/bash

#
# downloadNcbiGff.sh
#
# Downloads the source NCBI RefSeq GFF3 for each NCBI-derived UCSC assembly;
# src/addNcbiRefSeqGffTrack.ts adds it as a <db>-ncbiRefSeqGff FeatureTrack
# when the config is built.
#
# This is the full-resolution NCBI annotation (rich GFF3 gene -> mRNA -> CDS/exon
# structure), complementary to UCSC's own genePred-derived ncbiRefSeq tracks. The
# assembly's refNameAliases (UCSC chromAlias.txt) maps the GFF's RefSeq accession
# seqids (NC_000001.11) to UCSC names (chr1) at load time, so the GFF loads as-is
# with no seqid rewriting. Per-contig genetic codes are handled separately by
# addGeneticCodes.ts in the post-processing phase.
#
# Which assemblies get one is derived, not listed: src/deriveNcbiAccessions.ts
# reads the live genome list plus hgFixed's asmEquivalent table and answers it
# per db, with ncbiRefSeqAccessions.tsv overriding. See that file for the three
# evidence sources and the addressability gate they all pass through.
#
# Usage:
#   ./downloadNcbiGff.sh             # every detected db
#   ./downloadNcbiGff.sh hg38 mm39   # only the named dbs
#
# By default we only fetch a GFF we don't already have, so a --reprocess-all
# rebuild re-derives configs from cached GFFs without re-hitting NCBI (matching
# genark2jbrowse). Set FETCH_UPDATES=1 to force a re-download of every GFF.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

GFF_DIR="$SCRIPT_DIR/gff"
CURATED_TSV="$SCRIPT_DIR/ncbiRefSeqAccessions.tsv"
mkdir -p "$GFF_DIR"

ACC_TSV=$(mktemp)
trap 'rm -f "$ACC_TSV"' EXIT
node "$SCRIPT_DIR/src/deriveNcbiAccessions.ts" \
  "$UCSC_BUILT_DIR/list.json" "$UCSC_DOWNLOADS_DIR" "$CURATED_TSV" >"$ACC_TSV"
log "$(wc -l <"$ACC_TSV") assemblies detected as NCBI-derived."

# Zero is never a legitimate answer for a genome list with hundreds of entries,
# and it is the shape every failure upstream of here takes: a derivation that
# throws, an input that moved, or -- as happened on 2026-08-27 -- a CLI entry
# guard that silently stops matching. `import.meta.main` is false for a .ts
# entry point under --experimental-strip-types, so deriveNcbiAccessions.ts wrote
# nothing and exited 0. The old log line read "0 assemblies detected as
# NCBI-derived.", which looks like a normal count rather than a broken run, and
# every one of the 238 assemblies lost its ncbiRefSeqGff track with no error
# anywhere. Refuse instead of proceeding over an empty list.
if [ ! -s "$ACC_TSV" ] || [ "$(grep -vc '^#\|^$' "$ACC_TSV")" -eq 0 ]; then
  echo "ERROR: no assemblies detected as NCBI-derived." >&2
  echo "  deriveNcbiAccessions.ts produced an empty list from $UCSC_BUILT_DIR/list.json" >&2
  echo "  ($(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))['ucscGenomes']))" "$UCSC_BUILT_DIR/list.json" 2>/dev/null || echo '?') genomes in that list)." >&2
  echo "  This is a broken derivation, not an empty answer -- refusing rather than" >&2
  echo "  adding no GFF track to any assembly." >&2
  exit 1
fi

# Restrict to dbs named on the command line, when any are given.
declare -A WANT
for a in "$@"; do
  WANT["$a"]=1
done

# Downloads, sorts, bgzips and indexes one assembly's NCBI RefSeq GFF into
# gff/<db>.gff.gz. Whether its seqids reach the assembly, and the track itself,
# are src/addNcbiRefSeqGffTrack.ts's business, in the config build.
process_db() {
  local db="$1"
  local acc="$2"
  local gff="$GFF_DIR/$db.gff.gz"

  # Shared with genark2jbrowse/downloadNcbiGff.sh; the .csi rather than the
  # .gff.gz is the witness, since a run that died between bgzip and tabix
  # leaves the latter behind. See needs_gff_fetch in lib/common.sh.
  if needs_gff_fetch "$gff.csi"; then
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
}

while IFS=$'\t' read -r db acc _assembly_name _source; do
  case "$db" in
  '' | '#'*) continue ;;
  esac
  if [ "$#" -gt 0 ] && [ -z "${WANT[$db]:-}" ]; then
    continue
  fi
  process_db "$db" "$acc"
done <"$ACC_TSV"

log "NCBI RefSeq GFF processing complete."
