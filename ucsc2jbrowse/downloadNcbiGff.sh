#!/bin/bash

#
# downloadNcbiGff.sh
#
# Downloads and processes the GFF for hs1.
#

set -euo pipefail

# --- Configuration ---

: ${UCSC_RESULTS_DIR:=~/ucscResults}

# --- Main Script ---

mkdir -p gff
cd gff

if [ ! -f hs1.gff.gz.csi ]; then
  echo "Downloading and processing hs1 GFF..."
  datasets download genome accession GCF_009914755.1 --include gff3,seq-report
  unzip ncbi_dataset.zip
  jbrowse sort-gff ncbi_dataset/data/GCF_009914755.1/genomic.gff | bgzip -@2 >hs1.gff.gz
  tabix -C hs1.gff.gz
fi

cd ..

echo "Adding hs1 GFF track to JBrowse..."
jbrowse add-track gff/hs1.gff.gz --force --trackId hs1-ncbiRefSeqGff --name "NCBI RefSeq - RefSeq All (GFF)" --category "Genes and Gene Predictions" --out "$UCSC_RESULTS_DIR/hs1/" --load copy --indexFile gff/hs1.gff.gz.csi

echo "Indexing hs1 GFF track..."
jbrowse text-index --force --out "$UCSC_RESULTS_DIR/hs1" --tracks hs1-ncbiRefSeqGff
