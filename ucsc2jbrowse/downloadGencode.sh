#!/bin/bash

set -e

# Function to process a single GFF file
process_gff_file() {
  local assembly_name=$1
  local url=$2
  local track_name=$3

  # Define directories
  local gencode_dir="${GENCODE_DIR:-/mnt/sdb/cdiesh/gencode}"
  local gencode_processed_dir="${GENCODE_PROCESSED_DIR:-/mnt/sdb/cdiesh/gencode_processed}"
  local output_dir="${UCSC_RESULT_DIR:-~/ucscResults}/$assembly_name"

  # Create all necessary directories
  mkdir -p "$gencode_dir"
  mkdir -p "$gencode_processed_dir"
  mkdir -p "$output_dir"

  echo "Processing GFF file for assembly: $assembly_name"

  # Get the filename from the URL
  local filename=$(basename "$url")
  local gff_file="${filename%.gz}"
  local sorted_gff_file="${gff_file%.gff3}.sorted.gff3"

  # Define full paths for the files
  local downloaded_gz_file="$gencode_dir/$filename"
  local downloaded_gff_file="$gencode_dir/$gff_file"
  local output_sorted_gff_file="$gencode_processed_dir/$sorted_gff_file"

  # Download the file to GENCODE_DIR (only if changed)
  echo "Checking for updates: $url"
  cd "$gencode_dir"
  wget -N "$url"
  cd - >/dev/null

  # Gunzip the downloaded file if the .gz exists
  if [ -f "$downloaded_gz_file" ]; then
    echo "Extracting $filename..."
    gunzip -f "$downloaded_gz_file"
  elif [ ! -f "$downloaded_gff_file" ]; then
    echo "Error: Neither $downloaded_gz_file nor $downloaded_gff_file found"
    return 1
  else
    echo "Using existing extracted file: $downloaded_gff_file"
  fi

  # Sort the GFF file to GENCODE_PROCESSED_DIR
  echo "Sorting $gff_file..."
  jbrowse sort-gff "$downloaded_gff_file" >"$output_sorted_gff_file"

  # Add the track to JBrowse
  echo "Adding track for $sorted_gff_file..."
  jbrowse add-track "$output_sorted_gff_file" --out "$output_dir" --load copy --name "$track_name" --category "Genes and Gene Predictions"

  echo "Finished processing GFF file for assembly: $assembly_name"
}

# hg38 URLs and track names
HG38_URLS=(
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.chr_patch_hapl_scaff.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.primary_assembly.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.basic.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.chr_patch_hapl_scaff.basic.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.primary_assembly.basic.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.long_noncoding_RNAs.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.polyAs.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.2wayconspseudos.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.tRNAs.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_48/gencode.v48.promoter_windows.gff3.gz"
)
HG38_NAMES=(
  "GENCODE - Comprehensive gene annotation"
  "GENCODE - Comprehensive gene annotation"
  "GENCODE - Comprehensive gene annotation"
  "GENCODE - Basic gene annotation"
  "GENCODE - Basic gene annotation"
  "GENCODE - Basic gene annotation"
  "GENCODE - Long non-coding RNA gene annotation"
  "GENCODE - PolyA feature annotation"
  "GENCODE - Consensus pseudogenes predicted by the Yale and UCSC pipelines"
  "GENCODE - Predicted tRNA genes"
  "GENCODE - Promoter Windows"
)

# hg19 URLs and track names
HG19_URLS=(
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/GRCh37_mapping/gencode.v49lift37.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/GRCh37_mapping/gencode.v49lift37.basic.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/GRCh37_mapping/gencode.v49lift37.long_noncoding_RNAs.gff3.gz"
)
HG19_NAMES=(
  "GENCODE - Comprehensive gene annotation"
  "GENCODE - Basic gene annotation"
  "GENCODE - Long non-coding RNA gene annotation"
)

# mm39 URLs and track names
MM39_URLS=(
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.chr_patch_hapl_scaff.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.primary_assembly.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.basic.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.chr_patch_hapl_scaff.basic.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.primary_assembly.basic.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.long_noncoding_RNAs.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.polyAs.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.2wayconspseudos.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.tRNAs.gff3.gz"
)
MM39_NAMES=(
  "GENCODE - Comprehensive gene annotation"
  "GENCODE - Comprehensive gene annotation"
  "GENCODE - Comprehensive gene annotation"
  "GENCODE - Basic gene annotation"
  "GENCODE - Basic gene annotation"
  "GENCODE - Basic gene annotation"
  "GENCODE - Long non-coding RNA gene annotation"
  "GENCODE - PolyA feature annotation"
  "GENCODE - Consensus pseudogenes predicted by the Yale and UCSC pipelines"
  "GENCODE - Predicted tRNA genes"
)

# Process hg38 files
for i in "${!HG38_URLS[@]}"; do
  process_gff_file "hg38" "${HG38_URLS[$i]}" "${HG38_NAMES[$i]}"
done

# Process hg19 files
for i in "${!HG19_URLS[@]}"; do
  process_gff_file "hg19" "${HG19_URLS[$i]}" "${HG19_NAMES[$i]}"
done

# Process mm39 files
for i in "${!MM39_URLS[@]}"; do
  process_gff_file "mm39" "${MM39_URLS[$i]}" "${MM39_NAMES[$i]}"
done

echo "All files processed."
