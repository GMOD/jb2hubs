#!/bin/bash
# Builds and publishes the CAT gene files hprc-grch38.json's haplotype tracks
# name, to s3://jbrowse.org/pangenome/hprc-grch38/genes/. A haplotype lane reads
# its gene models from these; without them it reads "no annotation".
#
# HPRC publishes a CAT annotation per release 2 haplotype, but as plain gzip in
# gene order, which a tabix index cannot be built over, so each is sorted,
# bgzipped and indexed here. Intron and codon rows are dropped, since the lane
# glyph draws exons and CDS, and so is any gene over 5 Mb with its descendants:
# CAT's liftoff pass leaves a few that span most of a contig (a 61 Mb lncRNA on
# HG01960.1), and a tabix query anywhere under one returns it. The filter is
# build_hprc_multiway_synteny.sh's in jbrowse-components, whose output this
# replaced.
#
# Which haplotypes is whatever the config names: run
# website/generatePangenomeHaplotypes.ts first. On the build box, not in run.sh:
# the first run downloads ~6 GB. A file already built is kept, so a rerun after
# the panels grow fetches only the new haplotypes. Publish these before
# upload.sh publishes a config that names them.
#
# Usage: website/pangenome-config/buildHprcGenes.sh
#   HPRC_GENES_DIR  work dir (default /mnt/sdb/cdiesh/hprcCatGenes)
#   JOBS            haplotypes processed at once (default 6)
set -euo pipefail
cd "$(dirname "$0")"
source ../../lib/common.sh

WORK="${HPRC_GENES_DIR:-/mnt/sdb/cdiesh/hprcCatGenes}"
JOBS="${JOBS:-6}"
CAT_INDEX=https://raw.githubusercontent.com/human-pangenomics/hprc_intermediate_assembly/main/data_tables/annotation/cat/cat_genes_hprc_r2_v1.3.index.csv
GENE_LIMIT=5000000
DEST=jbrowse-data:jbrowse.org/pangenome/hprc-grch38/genes

assert_bgzip_toolchain
mkdir -p "$WORK/raw" "$WORK/genes"
exec > >(tee -a "$WORK/build.log") 2>&1
log "Building CAT gene files in $WORK"

curl -fsSL -o "$WORK/cat_index.csv" "$CAT_INDEX"

build_genes() {
  local assembly=$1 url=$2
  local raw="$WORK/raw/$assembly.cat.gff3.gz"
  local out="$WORK/genes/$assembly.genes.gff3.gz"
  if [ -f "$out" ] && [ -f "$out.tbi" ]; then
    return
  fi
  if [ ! -f "$raw" ]; then
    curl -fsS -o "$raw.part" "$url"
    mv "$raw.part" "$raw"
  fi
  local dropped="$WORK/raw/$assembly.dropped_genes.txt"
  gzip -dc "$raw" |
    awk -F'\t' -v limit="$GENE_LIMIT" '$3=="gene" && $5-$4 > limit {
      n = split($9, kv, ";")
      for (i = 1; i <= n; i++) if (kv[i] ~ /^ID=/) print substr(kv[i], 4)
    }' >"$dropped"
  # every CAT row names its gene in gene_id=, so descendants drop on one key
  {
    echo '##gff-version 3'
    gzip -dc "$raw" |
      awk -F'\t' -v dropfile="$dropped" '
        BEGIN { while ((getline g < dropfile) > 0) drop[g] = 1 }
        /^#/ { next }
        $3=="intron" || $3=="start_codon" || $3=="stop_codon" { next }
        {
          n = split($9, kv, ";"); g = ""
          for (i = 1; i <= n; i++) if (kv[i] ~ /^gene_id=/) g = substr(kv[i], 9)
          if (!(g in drop)) print
        }' |
      LC_ALL=C sort -S 1G -k1,1 -k4,4n -k5,5n
  } | bgzip -c >"$out.part"
  tabix -f -p gff "$out.part"
  mv "$out.part.tbi" "$out.tbi"
  mv "$out.part" "$out"
  echo "  $assembly: $(gzip -dc "$out" | awk -F'\t' '$3=="gene"' | wc -l) genes, $(wc -l <"$dropped") over $GENE_LIMIT bp dropped"
}
export -f build_genes
export WORK GENE_LIMIT

# `HG00097.1` is the assembly for PanSN `HG00097#1`; the index is keyed by
# sample and haplotype number.
jq -r '.tracks[] | select(.trackId | endswith("_cat_genes")) | .assemblyNames[0]' \
  hprc-grch38.json |
  while read -r assembly; do
    s3=$(awk -F, -v s="${assembly%.*}" -v h="${assembly##*.}" \
      '$1==s && $2==h {print $4}' "$WORK/cat_index.csv")
    if [ -z "$s3" ]; then
      echo "no CAT annotation indexed for $assembly" >&2
      exit 1
    fi
    printf '%s\n%s\n' "$assembly" \
      "https://s3-us-west-2.amazonaws.com/${s3#s3://}"
  done |
  xargs -P "$JOBS" -n 2 bash -c 'build_genes "$@"' _

cat >"$WORK/genes/README.txt" <<EOF
HPRC release 2 CAT gene annotations, one per haplotype, indexed for JBrowse 2
===========================================================================

A redistribution of HPRC data, not original data. Each <sample>.<haplotype>
.genes.gff3.gz is that haplotype's CAT annotation from the release 2 index

  $CAT_INDEX

with intron, start_codon and stop_codon rows dropped, genes over $GENE_LIMIT bp
removed with their descendants, sorted by contig and start, bgzipped and
tabix-indexed. Contig names are the assembly's own, as the annotation writes
them. HPRC data is released under CC0; see
https://github.com/human-pangenomics/hpp_pangenome_resources for the release
and its terms.

Read by the haplotype lanes of https://jbrowse.org/pangenome/hprc-grch38/config.json.
Rebuilt by website/pangenome-config/buildHprcGenes.sh in
https://github.com/GMOD/jb2hubs with $(bgzip --version | head -1) and
$(tabix --version | head -1).

Files
-----

$(cd "$WORK/genes" && for f in *.genes.gff3.gz; do printf '  %s  %s bytes\n' "$f" "$(stat -c %s "$f")"; done)
EOF

changed=$(rclone_sync_with_indexes "$WORK/genes" "$DEST" --exclude "*.part")
log "$changed object(s) changed under $DEST"
if [ "$changed" -gt 0 ]; then
  cloudfront_invalidate "/pangenome/hprc-grch38/genes/*"
fi
