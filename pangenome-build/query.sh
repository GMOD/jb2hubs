#!/usr/bin/env bash
#
# Project one reference region across the whole panel using the impg index built
# by build.sh, extract the homologous sequence from every strain, and align them
# into an MSA. The MSA FASTA drops straight into the website's pangenome explorer
# (website/public/pangenome/msa/<id>.fa), rendered by react-msaview — no served
# JBrowse track needed.
#
# Requires on $PATH: impg, samtools, abpoa (swap in spoa/mafft if preferred).
#
# Usage: ./query.sh <panel.paf> <id> <region> [merge_bp] [outdir]
#   region is PanSN-qualified, e.g. GRCm39#1#NC_000083.7:33000000-34000000
#   merge_bp (-d) is the largest gap/SV a single projection may absorb.
set -euo pipefail

PAF="${1:?usage: query.sh <panel.paf> <id> <region> [merge_bp] [outdir]}"
ID="${2:?missing locus id}"
REGION="${3:?missing region, e.g. GRCm39#1#NC_000083.7:33000000-34000000}"
MERGE="${4:-10000}"
OUT="${5:-$(dirname "$PAF")}"
PAN="$(dirname "$PAF")/panel.pansn.fa"
INDEX="${PAF%.paf}.impg"

for tool in impg samtools abpoa; do
  command -v "$tool" >/dev/null || { echo "ERROR: '$tool' not on PATH" >&2; exit 1; }
done

mkdir -p "$OUT/msa" "$OUT/tmp"
bed="$OUT/tmp/${ID}.bed"

# impg query -> BED of homologous intervals across every sample (one per line).
# Prefer the prebuilt index (-i); fall back to re-reading the PAF (-a) on impg
# versions whose `query` only accepts -a (it auto-uses the sibling index).
impg query -i "$INDEX" -r "$REGION" -d "$MERGE" -o bed 2>/dev/null >"$bed" ||
  impg query -a "$PAF" -r "$REGION" -d "$MERGE" -o bed >"$bed"

# Pull each interval's sequence from the combined panel FASTA, then align.
seqs="$OUT/tmp/${ID}.seqs.fa"
: >"$seqs"
while read -r contig start end rest; do
  samtools faidx "$PAN" "${contig}:$((start + 1))-${end}" >>"$seqs"
done <"$bed"

n=$(grep -c '^>' "$seqs" || true)
abpoa "$seqs" -r1 >"$OUT/msa/${ID}.fa"
echo "   $ID: $n homologous intervals -> $OUT/msa/${ID}.fa"
