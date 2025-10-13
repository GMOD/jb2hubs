#!/bin/bash

set -e

: ${UCSC_RESULTS_DIR:=~/ucscResults}
# Function to process a single GFF file
process_gff_file() {
  local assembly_name=$1
  local url=$2
  local track_name=$3
  local track_id=$4

  # Define directories
  local gencode_dir="${GENCODE_DIR:-/mnt/sdb/cdiesh/gencode}"
  local gencode_processed_dir="${GENCODE_PROCESSED_DIR:-/mnt/sdb/cdiesh/gencode_processed}"
  local output_dir="${UCSC_RESULTS_DIR}/$assembly_name"

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
  local temp_gff_file="$gencode_processed_dir/$gff_file"
  local output_sorted_gff_file="$gencode_processed_dir/$sorted_gff_file"

  # Download the file to GENCODE_DIR (only if changed)
  echo "Checking for updates: $url"
  cd "$gencode_dir"
  wget -q -N "$url"
  cd - >/dev/null

  # Check if the downloaded file exists
  if [ ! -f "$downloaded_gz_file" ]; then
    echo "Error: Download failed for $url"
    return 1
  fi

  # Extract to temp file in GENCODE_PROCESSED_DIR using zcat
  echo "Extracting $filename to processing directory..."
  zcat "$downloaded_gz_file" >"$temp_gff_file"

  # Sort the GFF file to GENCODE_PROCESSED_DIR
  echo "Sorting $gff_file..."
  jbrowse sort-gff "$temp_gff_file" >"$output_sorted_gff_file"

  # Remove the temporary uncompressed file
  rm "$temp_gff_file"

  # Bgzip the sorted GFF file
  echo "Compressing $sorted_gff_file with bgzip..."
  bgzip -f -@8 "$output_sorted_gff_file"
  local output_sorted_gff_gz="$output_sorted_gff_file.gz"

  # Create tabix index with CSI format
  echo "Indexing $sorted_gff_file.gz with tabix..."
  tabix -C -p gff "$output_sorted_gff_gz"
  local output_sorted_gff_csi="$output_sorted_gff_gz.csi"

  # Add the track to JBrowse
  echo "Adding track for $sorted_gff_file.gz..."
  jbrowse add-track "$output_sorted_gff_gz" --indexFile "$output_sorted_gff_csi" --out "$output_dir" --load copy --name "$track_name" --trackId "$track_id" --category "Genes and Gene Predictions" --force

  echo "Finished processing GFF file for assembly: $assembly_name"
}

# hg38 URLs and track names
HG38_URLS=(
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.basic.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.long_noncoding_RNAs.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.polyAs.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.2wayconspseudos.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_49/gencode.v49.tRNAs.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_48/gencode.v48.promoter_windows.gff3.gz"
)
HG38_NAMES=(
  "GENCODE - Comprehensive gene annotation"
  "GENCODE - Basic gene annotation"
  "GENCODE - lncRNA gene annotation"
  "GENCODE - PolyA feature annotation"
  "GENCODE - Consensus pseudogenes predicted by the Yale and UCSC pipelines"
  "GENCODE - Predicted tRNA genes"
  "GENCODE - Promoter Windows"
)
HG38_TRACK_IDS=(
  "hg38-gencodeComp"
  "hg38-gencodeBasic"
  "hg38-gencodeLncRNA"
  "hg38-gencodePolyA"
  "hg38-gencodePseudo"
  "hg38-gencodetRNA"
  "hg38-gencodePromoter"
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
  "GENCODE - lncRNA gene annotation"
)
HG19_TRACK_IDS=(
  "hg19-gencodeComp"
  "hg19-gencodeBasic"
  "hg19-gencodeLncRNA"
)

# mm39 URLs and track names
MM39_URLS=(
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.basic.annotation.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.long_noncoding_RNAs.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.polyAs.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.2wayconspseudos.gff3.gz"
  "https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M38/gencode.vM38.tRNAs.gff3.gz"
)
MM39_NAMES=(
  "GENCODE - Comprehensive gene annotation"
  "GENCODE - Basic gene annotation"
  "GENCODE - lncRNA gene annotation"
  "GENCODE - PolyA feature annotation"
  "GENCODE - Consensus pseudogenes predicted by the Yale and UCSC pipelines"
  "GENCODE - Predicted tRNA genes"
)
MM39_TRACK_IDS=(
  "mm39-gencodeComp"
  "mm39-gencodeBasic"
  "mm39-gencodeLncRNA"
  "mm39-gencodePolyA"
  "mm39-gencodePseudo"
  "mm39-gencodetRNA"
)

# Process hg38 files
for i in "${!HG38_URLS[@]}"; do
  process_gff_file "hg38" "${HG38_URLS[$i]}" "${HG38_NAMES[$i]}" "${HG38_TRACK_IDS[$i]}"
done

# Process hg19 files
for i in "${!HG19_URLS[@]}"; do
  process_gff_file "hg19" "${HG19_URLS[$i]}" "${HG19_NAMES[$i]}" "${HG19_TRACK_IDS[$i]}"
done

# Process mm39 files
for i in "${!MM39_URLS[@]}"; do
  process_gff_file "mm39" "${MM39_URLS[$i]}" "${MM39_NAMES[$i]}" "${MM39_TRACK_IDS[$i]}"
done

echo "All files processed."
