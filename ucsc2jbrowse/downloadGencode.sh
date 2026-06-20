#!/bin/bash

set -euo pipefail

source "$(dirname "$0")/common.sh"
# Configuration - can be overridden via environment variables
GENCODE_DIR="${GENCODE_DIR:-/mnt/sdb/cdiesh/gencode}"
GENCODE_PROCESSED_DIR="${GENCODE_PROCESSED_DIR:-/mnt/sdb/cdiesh/gencode_processed}"

# Function to process a single GFF file
process_gff_file() {
  local assembly_name=$1
  local url=$2
  local track_name=$3
  local track_id=$4
  local output_dir="${UCSC_BUILT_DIR}/$assembly_name"

  # Create all necessary directories
  mkdir -p "$GENCODE_DIR"
  mkdir -p "$GENCODE_PROCESSED_DIR"
  mkdir -p "$output_dir"

  # Get the filename from the URL
  local filename
  filename=$(basename "$url")
  local gff_file="${filename%.gz}"
  local sorted_gff_file="${gff_file%.gff3}.sorted.gff3"

  # Define full paths for the files
  local downloaded_gz_file="$GENCODE_DIR/$filename"
  local temp_gff_file="$GENCODE_PROCESSED_DIR/$gff_file"
  local output_sorted_gff_file="$GENCODE_PROCESSED_DIR/$sorted_gff_file"

  # Download the file to GENCODE_DIR (only if changed)
  wget -q -N "$url" -P "$GENCODE_DIR"

  # Check if the downloaded file exists
  if [ ! -f "$downloaded_gz_file" ]; then
    echo "Error: Download failed for $url"
    return 1
  fi

  # Define the output file paths
  local output_sorted_gff_gz="$output_sorted_gff_file.gz"
  local output_sorted_gff_csi="$output_sorted_gff_gz.csi"

  # Check if either the .gff.gz or .gff.gz.csi files are missing from GENCODE_PROCESSED_DIR
  if [ ! -f "$output_sorted_gff_gz" ] || [ ! -f "$output_sorted_gff_csi" ]; then
    # Extract to temp file using zcat
    log "Extracting $filename to processing directory..."
    zcat "$downloaded_gz_file" >"$temp_gff_file"

    # Sort the GFF file
    log "Sorting $gff_file..."
    jbrowse sort-gff "$temp_gff_file" >"$output_sorted_gff_file"

    # Remove the temporary uncompressed file
    rm "$temp_gff_file"

    # Bgzip the sorted GFF file
    log "Compressing $sorted_gff_file with bgzip..."
    bgzip -f -@8 "$output_sorted_gff_file"

    # Create tabix index with CSI format
    log "Indexing $sorted_gff_file.gz with tabix..."
    tabix -C -p gff "$output_sorted_gff_gz"
  else
    log "Processed files already exist in $GENCODE_PROCESSED_DIR, skipping sort/bgzip/tabix for $filename"
  fi

  # Add the track to JBrowse (skip if already present in config)
  if ! grep -q "\"$track_id\"" "$output_dir/config.json" 2>/dev/null; then
    jbrowse add-track "$output_sorted_gff_gz" --indexFile "$output_sorted_gff_csi" --out "$output_dir" --load copy --name "$track_name" --trackId "$track_id" --category "Genes and Gene Predictions" --force
  fi
}

# GENCODE track definitions, one row per line as "url|track name|trackId".
# Keeping the three fields together per row avoids the index-alignment hazard of
# separate parallel arrays.
HG38_TRACKS="\
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.annotation.gff3.gz|GENCODE V49 - Comprehensive gene annotation|hg38-gencodeComp
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.basic.annotation.gff3.gz|GENCODE V49 - Basic gene annotation|hg38-gencodeBasic
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.long_noncoding_RNAs.gff3.gz|GENCODE V49 - lncRNA gene annotation|hg38-gencodeLncRNA
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.polyAs.gff3.gz|GENCODE V49 - PolyA feature annotation|hg38-gencodePolyA
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.2wayconspseudos.gff3.gz|GENCODE V49 - Consensus pseudogenes predicted by the Yale and UCSC pipelines|hg38-gencodePseudo
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.tRNAs.gff3.gz|GENCODE V49 - Predicted tRNA genes|hg38-gencodetRNA
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_48/gencode.v48.promoter_windows.gff3.gz|GENCODE V49 - Promoter Windows|hg38-gencodePromoter"

HG19_TRACKS="\
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/GRCh37_mapping/gencode.v49lift37.annotation.gff3.gz|GENCODE V49 - Comprehensive gene annotation|hg19-gencodeComp
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/GRCh37_mapping/gencode.v49lift37.basic.annotation.gff3.gz|GENCODE V49 - Basic gene annotation|hg19-gencodeBasic
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/GRCh37_mapping/gencode.v49lift37.long_noncoding_RNAs.gff3.gz|GENCODE V49 - lncRNA gene annotation|hg19-gencodeLncRNA"

MM39_TRACKS="\
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.annotation.gff3.gz|GENCODE VM38 - Comprehensive gene annotation|mm39-gencodeComp
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.basic.annotation.gff3.gz|GENCODE VM38 - Basic gene annotation|mm39-gencodeBasic
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.long_noncoding_RNAs.gff3.gz|GENCODE VM38 - lncRNA gene annotation|mm39-gencodeLncRNA
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.polyAs.gff3.gz|GENCODE VM38 - PolyA feature annotation|mm39-gencodePolyA
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.2wayconspseudos.gff3.gz|GENCODE VM38 - Consensus pseudogenes predicted by the Yale and UCSC pipelines|mm39-gencodePseudo
https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.tRNAs.gff3.gz|GENCODE VM38 - Predicted tRNA genes|mm39-gencodetRNA"

# Process one species table: one "url|name|trackId" row at a time.
process_table() {
  local assembly_name=$1 table=$2
  while IFS='|' read -r url name track_id; do
    [ -n "$url" ] || continue
    process_gff_file "$assembly_name" "$url" "$name" "$track_id"
  done <<<"$table"
}

process_table hg38 "$HG38_TRACKS"
process_table hg19 "$HG19_TRACKS"
process_table mm39 "$MM39_TRACKS"

log "All GENCODE files processed."
