#!/usr/bin/env bash
#
# Genome-wide implicit pangenome (impg) build for a panel of assemblies.
#
# Aligns every strain against the reference (first sample in panel.tsv) with
# wfmash, then builds an impg index. impg is an *implicit* pangenome: it stores
# the alignments, not a graph, so once the index exists ANY region of the
# reference can be projected onto every other assembly instantly (see query.sh).
#
# Using reference-based alignment (each strain vs reference) rather than
# all-vs-all keeps the wfmash sketch small (~800 MB for GRCm39 vs ~15 GB for
# the full 47 GB panel), which avoids OOM on machines where swap is heavily used.
# impg only needs reference-anchored alignments to project reference loci.
#
# Run on a compute node with the assemblies' worth of scratch (mouse panel is
# ~18 x 2.5 GB FASTA + the PAF). The output index is small and portable.
#
# Requires on $PATH: datasets (NCBI), samtools, wfmash, impg, awk, gzip.
#
# Usage: ./build.sh [panel.tsv] [outdir] [threads]
set -euo pipefail

# Pick up singularity shims for wfmash/impg if run.sh hasn't already set PATH.
_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$_DIR/bin:$PATH"
export PGGB_SANDBOX="${PGGB_SANDBOX:-$HOME/pggb_sandbox}"

PANEL="${1:-mouse-strains.tsv}"
OUT="${2:-build}"
THREADS="${3:-$(nproc 2>/dev/null || echo 8)}"

# wfmash mapping params — tuned for same-species (strain) mammalian assemblies.
# -s segment length, -p min identity, -l block length. Loosen -p for cross-
# species panels. See https://github.com/waveygang/wfmash.
WFMASH_PARAMS="${WFMASH_PARAMS:--s 10000 -p 95 -l 50000}"

# Minimum sequence length to include in the pangenome — filters out small
# unplaced scaffolds that add noise and computation but no locus-projection value.
MIN_SEQ_LEN="${MIN_SEQ_LEN:-5000000}"

for tool in datasets samtools wfmash impg awk; do
  command -v "$tool" >/dev/null || {
    echo "ERROR: '$tool' not on PATH" >&2
    exit 1
  }
done

mkdir -p "$OUT/fasta"
PAN="$OUT/panel.pansn.fa"
: >"$PAN"

# Download each assembly, rename every contig to PanSN (sample#1#contig), and
# append to one combined FASTA. PanSN-prefixed names are what wfmash/impg use to
# attribute alignments back to a sample.
while IFS=$'\t' read -r acc sample; do
  case "$acc" in '' | \#*) continue ;; esac
  fa="$OUT/fasta/${sample}.fa"
  if [ ! -s "$fa" ]; then
    echo ">> downloading $acc ($sample)"
    for attempt in 1 2 3; do
      if datasets download genome accession "$acc" \
        --include genome --filename "$OUT/$acc.zip"; then
        break
      fi
      echo ">> attempt $attempt failed, retrying..."
      rm -f "$OUT/$acc.zip"
      sleep $((attempt * 5))
    done
    unzip -o "$OUT/$acc.zip" -d "$OUT/$acc.tmp" >/dev/null
    cat "$OUT/$acc.tmp/ncbi_dataset/data/$acc"/*.fna >"$fa"
    rm -rf "$OUT/$acc.zip" "$OUT/$acc.tmp"
  fi
  echo ">> adding $sample to panel"
  awk -v s="$sample" '/^>/{print ">" s "#1#" substr($1,2); next} {print}' "$fa" >>"$PAN"
done <"$PANEL"

samtools faidx "$PAN"

# Filter to sequences >= MIN_SEQ_LEN to exclude small unplaced scaffolds.
PAN_MAJOR="$OUT/panel.major.pansn.fa"
if [ ! -s "$PAN_MAJOR" ]; then
  echo ">> filtering to sequences >= ${MIN_SEQ_LEN}bp -> $PAN_MAJOR"
  awk -v min="$MIN_SEQ_LEN" '$2 >= min {print $1}' "$PAN.fai" |
    xargs samtools faidx "$PAN" >"$PAN_MAJOR"
  samtools faidx "$PAN_MAJOR"
  seq_count=$(wc -l <"$PAN_MAJOR.fai")
  echo ">> kept $seq_count sequences"
fi

# Extract every PanSN sequence belonging to one sample into its own FASTA. The
# index's first column is `sample#hap#contig`, so an exact prefix match (index()
# ==1, not a regex) tolerates '.' or other metacharacters in sample names.
extract_sample() {
  local sample="$1" out="$2"
  awk -v s="$sample" 'index($1, s "#") == 1 {print $1}' "$PAN_MAJOR.fai" |
    xargs -r samtools faidx "$PAN_MAJOR" >"$out"
  samtools faidx "$out"
}

# Reference-based alignment: map each non-reference strain against the reference
# (first non-comment sample in the panel). This keeps the wfmash sketch small
# (~800 MB for one mouse genome vs ~15 GB for the full panel), avoiding OOM.
# impg only needs reference-anchored alignments to project reference loci.
PAF="$OUT/panel.paf"
: >"$PAF"

REF_SAMPLE=""
REF_FA="$OUT/ref.pansn.fa"

while IFS=$'\t' read -r acc sample; do
  case "$acc" in '' | \#*) continue ;; esac
  if [ -z "$REF_SAMPLE" ]; then
    REF_SAMPLE="$sample"
    echo ">> reference sample: $REF_SAMPLE"
    extract_sample "$REF_SAMPLE" "$REF_FA"
    continue
  fi
  STRAIN_PAF="$OUT/${sample}.paf"
  if [ ! -s "$STRAIN_PAF" ]; then
    STRAIN_FA="$OUT/${sample}.pansn.fa"
    extract_sample "$sample" "$STRAIN_FA"
    echo ">> wfmash $sample -> $REF_SAMPLE ($THREADS threads)"
    wfmash $WFMASH_PARAMS -t "$THREADS" "$REF_FA" "$STRAIN_FA" >"$STRAIN_PAF"
    rm -f "$STRAIN_FA" "$STRAIN_FA.fai"
  else
    echo ">> $STRAIN_PAF exists, skipping"
  fi
  cat "$STRAIN_PAF" >>"$PAF"
done <"$PANEL"

# Build the impg index (impg index -a <paf> -i <index>); query/partition reuse it.
INDEX="$OUT/panel.impg"
echo ">> impg index -> $INDEX"
impg index -a "$PAF" -i "$INDEX"

echo
echo "Done. impg index: $INDEX"
echo "Project a locus with:  ./query.sh $PAF <id> GRCm39#1#<accession>:<start>-<end>"
