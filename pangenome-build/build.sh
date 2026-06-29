#!/usr/bin/env bash
#
# Genome-wide implicit pangenome (impg) build for a panel of assemblies.
#
# Aligns every assembly all-vs-all with wfmash, then builds an impg index. impg
# is an *implicit* pangenome: it stores the alignments, not a graph, so once the
# index exists ANY region of the reference can be projected onto every other
# assembly instantly (see query.sh). This is far lighter than minigraph-cactus
# (no graph construction, no high-RAM cactus toolchain); the only real cost is
# the one-time all-vs-all alignment, which wfmash parallelizes across threads.
#
# Run on a compute node with the assemblies' worth of scratch (mouse panel is
# ~18 x 2.5 GB FASTA + the PAF). The output index is small and portable.
#
# Requires on $PATH: datasets (NCBI), samtools, wfmash, impg, awk, gzip.
#
# Usage: ./build.sh [panel.tsv] [outdir] [threads]
set -euo pipefail

PANEL="${1:-mouse-strains.tsv}"
OUT="${2:-build}"
THREADS="${3:-$(nproc 2>/dev/null || echo 8)}"

# wfmash mapping params — tuned for same-species (strain) mammalian assemblies.
# -s segment length, -p min identity, -l block length. Loosen -p for cross-
# species panels. See https://github.com/waveygang/wfmash.
WFMASH_PARAMS="${WFMASH_PARAMS:--s 10000 -p 95 -l 50000}"

for tool in datasets samtools wfmash impg awk; do
  command -v "$tool" >/dev/null || { echo "ERROR: '$tool' not on PATH" >&2; exit 1; }
done

mkdir -p "$OUT/fasta"
PAN="$OUT/panel.pansn.fa"
: >"$PAN"

# Download each assembly, rename every contig to PanSN (sample#1#contig), and
# append to one combined FASTA. PanSN-prefixed names are what wfmash/impg use to
# attribute alignments back to a sample.
while IFS=$'\t' read -r acc sample; do
  case "$acc" in ''|\#*) continue ;; esac
  fa="$OUT/fasta/${sample}.fa"
  if [ ! -s "$fa" ]; then
    echo ">> downloading $acc ($sample)"
    datasets download genome accession "$acc" \
      --include genome --filename "$OUT/$acc.zip"
    unzip -o "$OUT/$acc.zip" -d "$OUT/$acc.tmp" >/dev/null
    cat "$OUT/$acc.tmp/ncbi_dataset/data/$acc"/*.fna >"$fa"
    rm -rf "$OUT/$acc.zip" "$OUT/$acc.tmp"
  fi
  echo ">> adding $sample to panel"
  awk -v s="$sample" '/^>/{print ">" s "#1#" substr($1,2); next} {print}' "$fa" >>"$PAN"
done <"$PANEL"

samtools faidx "$PAN"

# All-vs-all alignment. wfmash uses the same FASTA as target and query; PanSN
# grouping attributes each mapping back to its sample. --eqx/`=`/`X` CIGARs are
# required by impg, which wfmash emits by default.
PAF="$OUT/panel.paf"
echo ">> wfmash all-vs-all ($THREADS threads) -> $PAF"
wfmash $WFMASH_PARAMS -t "$THREADS" "$PAN" "$PAN" >"$PAF"

# Build the impg index (impg index -a <paf> -i <index>); query/partition reuse it.
INDEX="$OUT/panel.impg"
echo ">> impg index -> $INDEX"
impg index -a "$PAF" -i "$INDEX"

echo
echo "Done. impg index: $INDEX"
echo "Project a locus with:  ./query.sh $PAF <id> GRCm39#1#<accession>:<start>-<end>"
