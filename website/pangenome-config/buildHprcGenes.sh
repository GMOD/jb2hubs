#!/bin/bash
# Builds and publishes the gene models hprc-grch38.json's haplotype tracks name,
# to s3://jbrowse.org/pangenome/hprc-grch38/genes/. A haplotype lane reads its
# genes from these; without them it reads "no annotation".
#
# HPRC publishes a CAT annotation per release 2 haplotype, as plain gzip in gene
# order that no index can be built over. Each is reduced here to one transcript
# per named gene in BED12, sorted, bgzipped and tabix-indexed:
# website/src/components/pangenomeGeneModels.ts has the rules, which read
# GENCODE v48, the release CAT projected, for Ensembl's canonical transcripts.
# That is ~2 MB where the annotation is 129 MB bgzipped, because a lane draws
# one model per gene and CAT repeats a ~30-field attribute block on every exon
# row. Where CAT stacked two paralogs on one locus, the converter cuts the
# graph's GRCh38 walk file (1.2 GB, kept in the work dir) to find which one
# the haplotype has there.
#
# Genes GRCh38's primary assembly lacks, which CAT never projects, come from
# website/generatePangenomeLocusGenes.ts first: for each locus in
# website/src/components/pangenomeLocusGenes.ts it splices GENCODE's
# alt-contig transcript onto each haplotype's walk across the locus, read from
# HPRC's assembly (36 MB of range reads in about 30 s, kept in the work dir;
# needs minimap2).
#
# Which haplotypes is whatever the config names: run
# website/generatePangenomeHaplotypes.ts first. On the build box, not in run.sh:
# the first run downloads ~50 GB of CAT GFF3. The download and the BED are kept,
# and each BED is stamped with the source_tree_hash of the converter and this
# script and the walk file's index, so a rerun rebuilds what is new or was
# written by other rules or another graph. Publish
# these before upload.sh publishes a config that names them.
#
# Usage: website/pangenome-config/buildHprcGenes.sh
#   HPRC_GENES_DIR  work dir (default /mnt/sdb/cdiesh/hprcCatGenes)
#   JOBS            haplotypes processed at once (default 8)
#   PUBLISH=0       build and write the README, then stop before the sync
set -euo pipefail
cd "$(dirname "$0")"
source ../../lib/common.sh

WORK="${HPRC_GENES_DIR:-/mnt/sdb/cdiesh/hprcCatGenes}"
JOBS="${JOBS:-8}"
CAT_INDEX=https://raw.githubusercontent.com/human-pangenomics/hprc_intermediate_assembly/main/data_tables/annotation/cat/cat_genes_hprc_r2_v1.3.index.csv
GENCODE_URL=https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_48/gencode.v48.annotation.gff3.gz
GENCODE_ALT_URL=https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_48/gencode.v48.chr_patch_hapl_scaff.annotation.gff3.gz
WALKS_URL=https://jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38-f5s.GRCh38.walks.bed.gz
DEST=jbrowse-data:jbrowse.org/pangenome/hprc-grch38/genes
CONVERTER="$(pwd)/../generatePangenomeGeneModels.ts"
LOCUS_GENERATOR="$(pwd)/../generatePangenomeLocusGenes.ts"
CONVERTER_HASH=$(source_tree_hash ../.. \
  website/generatePangenomeGeneModels.ts \
  website/generatePangenomeLocusGenes.ts \
  website/pangenomeHprcIndex.ts \
  website/src/components/pangenomeGeneModels.ts \
  website/src/components/pangenomeLocusGenes.ts \
  website/pangenome-config/buildHprcGenes.sh)

assert_bgzip_toolchain
if ! command -v minimap2 >/dev/null; then
  echo "buildHprcGenes.sh needs minimap2 on PATH" >&2
  exit 1
fi
mkdir -p "$WORK/raw" "$WORK/genes" "$WORK/stamps" "$WORK/walks" "$WORK/locus"
exec > >(tee -a "$WORK/build.log") 2>&1
log "Building gene models in $WORK"

curl -fsSL -o "$WORK/cat_index.csv" "$CAT_INDEX"
GENCODE="$WORK/${GENCODE_URL##*/}"
GENCODE_ALT="$WORK/${GENCODE_ALT_URL##*/}"
for url in "$GENCODE_URL" "$GENCODE_ALT_URL"; do
  file="$WORK/${url##*/}"
  if [ ! -f "$file" ]; then
    curl -fsS -o "$file.part" "$url"
    mv "$file.part" "$file"
  fi
done

WALKS="$WORK/walks/${WALKS_URL##*/}"
curl -fsS -o "$WALKS.tbi.part" "$WALKS_URL.tbi"
if [ ! -f "$WALKS" ] || ! cmp -s "$WALKS.tbi.part" "$WALKS.tbi"; then
  curl -fsS -o "$WALKS.part" "$WALKS_URL"
  mv "$WALKS.part" "$WALKS"
fi
mv "$WALKS.tbi.part" "$WALKS.tbi"
BUILD_STAMP="$CONVERTER_HASH $(xxhsum -H3 "$WALKS.tbi" 2>/dev/null | awk '{print $NF}')"

LOCUS_GENES="$WORK/locus/locus-genes.jsonl"
built=''
if [ -f "$WORK/stamps/locus-genes" ]; then
  read -r built <"$WORK/stamps/locus-genes"
fi
if [ ! -f "$LOCUS_GENES" ] || [ "$built" != "$BUILD_STAMP" ]; then
  node --no-warnings=ExperimentalWarning "$LOCUS_GENERATOR" \
    "$WALKS" "$GENCODE_ALT" "$WORK/locus" >"$LOCUS_GENES.part"
  mv "$LOCUS_GENES.part" "$LOCUS_GENES"
  echo "$BUILD_STAMP" >"$WORK/stamps/locus-genes"
fi

build_genes() {
  set -euo pipefail
  local assembly=$1 url=$2
  local raw="$WORK/raw/$assembly.cat.gff3.gz"
  local out="$WORK/genes/$assembly.genes.bed.gz"
  local stamp="$WORK/stamps/$assembly.converter" built=''
  if [ -f "$stamp" ]; then
    read -r built <"$stamp"
  fi
  if [ -f "$out" ] && [ -f "$out.tbi" ] && [ "$built" = "$BUILD_STAMP" ]; then
    return
  fi
  if [ ! -f "$raw" ]; then
    curl -fsS -o "$raw.part" "$url"
    mv "$raw.part" "$raw"
  fi
  node --no-warnings=ExperimentalWarning "$CONVERTER" "$raw" "$GENCODE" \
    --walks "$WALKS" --locus-genes "$LOCUS_GENES" \
    --haplotype "${assembly%.*}#${assembly##*.}" |
    LC_ALL=C sort -k1,1 -k2,2n | bgzip -c >"$out.part"
  # The config names the CSI. A TBI's linear index covers every contig at
  # 16 kb whatever the file holds, 160 KB a haplotype, which each lane
  # downloads; a CSI with 256 kb bins is 7 KB. The TBI stays for tabix users.
  tabix -f -p bed "$out.part"
  tabix -f --csi -m 18 -p bed "$out.part"
  mv "$out.part.tbi" "$out.tbi"
  mv "$out.part.csi" "$out.csi"
  mv "$out.part" "$out"
  echo "$BUILD_STAMP" >"$stamp"
}
export -f build_genes
export WORK CONVERTER BUILD_STAMP GENCODE WALKS LOCUS_GENES

# `HG00097.1` is the assembly for PanSN `HG00097#1`; the index is keyed by
# sample and haplotype number.
ASSEMBLIES=$(jq -r '.tracks[] | select(.trackId | endswith("_cat_genes")) | .assemblyNames[0]' \
  hprc-grch38.json)
if [ -z "$ASSEMBLIES" ]; then
  echo "hprc-grch38.json names no _cat_genes track; run website/generatePangenomeHaplotypes.ts first" >&2
  exit 1
fi
echo "$ASSEMBLIES" |
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
HPRC release 2 gene models, one transcript per gene per haplotype, for JBrowse 2
================================================================================

A redistribution of HPRC data, not original data. Each
<sample>.<haplotype>.genes.bed.gz is that haplotype's CAT annotation from the
release 2 index

  $CAT_INDEX

reduced to one transcript per gene as BED12, with the gene name in the name
column and the coding span as thickStart/thickEnd, sorted, bgzipped and
tabix-indexed twice: a .tbi, and the .csi with 256 kb bins that JBrowse reads.
Contig names are the assembly's own, as the annotation writes
them. The rules, which read GENCODE v48 ($GENCODE_URL),
the release CAT projected:

- A gene's model is the projection of its Ensembl canonical transcript (the
  GENCODE "Ensembl_canonical" tag on CAT's source_transcript), the one whose
  span is nearest the GRCh38 span where CAT projected it twice; failing that,
  the transcript with the longest coding sequence, then spliced length.
- Genes with no symbol are dropped: those CAT names by an Ensembl gene id, and
  CAT's own novel genes.
- Two coding genes whose models share most of their coding bases here, though
  their source transcripts lie apart on GRCh38, are one locus CAT projected two
  paralogs onto (GSTM1 onto GSTM2 where a haplotype lacks GSTM1, DRB5 onto
  DRB1). The converter keeps the gene whose source transcript's GRCh38 span
  the haplotype's walk crosses at the model, in the pangenome graph's walk file
  $WALKS_URL.
  Where the walk crosses both spans there or neither, it keeps the gene with
  the better CAT alignment goodness (the GFF3 score column; CAT's default
  there counts as a full match).
- Genes spanning over 5 Mb are dropped.

Genes GRCh38's primary assembly lacks
-------------------------------------

CAT projects GENCODE's primary-assembly annotation, so it gives no model to a
gene that only GRCh38's alt contigs hold. website/generatePangenomeLocusGenes.ts
adds one for each locus in website/src/components/pangenomeLocusGenes.ts:

$(cat "$WORK/locus/summary.txt")

- The window searched is the haplotype's stretch of the pangenome graph's walk
  across the GRCh38 span that holds the gene, or beside the insertion that
  does, read from the haplotype's HPRC release 2 assembly.
- minimap2 -x splice:hq splices the gene's transcript onto that window. The
  transcript's exons come from GENCODE's alt-aware annotation
  $GENCODE_ALT_URL
  and their bases from the contig at NCBI. The model's exons are the
  alignment's blocks between introns, and its coding span holds the CDS's
  aligned bases.
- The candidate gene that aligns best names each copy, and the copy gets a
  model when that gene aligns at 95% identity or more over 90% of its
  transcript. The model replaces the CAT models of the gene's family that
  overlap it.

What these miss, because CAT does:

- A gene only GRCh38's alt contigs hold, outside the loci above, has no model
  of its own: HLA-DRB3, HLA-DRB4, KIR2DL2, KIR2DL5A, KIR2DS1, KIR2DS2, KIR2DS3
  and KIR3DS1. A copy of one of them is labelled with whichever GRCh38 paralog
  CAT projected onto it.
- An extra copy CAT calls a novel isoform of a neighbouring gene has no model:
  HG01346#1's second GSTM1 is a "GSTM2" putative_novel_isoform.

HPRC data is released under CC0; see
https://github.com/human-pangenomics/hpp_pangenome_resources for the release
and its terms.

Read by the haplotype lanes of https://jbrowse.org/pangenome/hprc-grch38/config.json.
Rebuilt by website/pangenome-config/buildHprcGenes.sh in
https://github.com/GMOD/jb2hubs with $(bgzip --version | head -1),
$(tabix --version | head -1) and node $(node --version).

Files
-----

$(cd "$WORK/genes" && for f in *.genes.bed.gz; do printf '  %s  %s bytes\n' "$f" "$(stat -c %s "$f")"; done)
EOF

if [ "${PUBLISH:-1}" = 0 ]; then
  log "PUBLISH=0: built in $WORK/genes, not synced to $DEST"
  exit 0
fi
changed=$(rclone_sync_with_indexes "$WORK/genes" "$DEST" --exclude "*.part")
log "$changed object(s) changed under $DEST"
if [ "$changed" -gt 0 ]; then
  cloudfront_invalidate "/pangenome/hprc-grch38/genes/*"
fi
