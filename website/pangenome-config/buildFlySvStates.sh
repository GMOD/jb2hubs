#!/bin/bash
# Builds and publishes the structural-state sidecar of the fly graph, to
# s3://jbrowse.org/pangenome/fly-dm6/sv-states/, in the row format
# buildHprcSvStates.sh writes and `pangenomeSvStates.ts` reads.
#
# - **The graph records no paths, so the build maps each assembly back onto
#   it**, as buildArabidopsisSvStates.sh does: `minigraph -cxasm --call` per
#   assembly against the whole-genome graph, then `mgutils.js merge` and
#   `mgutils-es6.js merge2vcf -r0` (`svStates.sh`).
# - **The inputs are build_fly_pangenome.sh's** (jbrowse-components): the rGFA
#   and the graph/<name>.pansn.fa files it built the graph from.
# - **dm6 is the reference column, not a haplotype**, dropped as TAIR10 is.
# - **An assembly lacking a chromosome is a no call there**: only dm6 and
#   CantonS_Yunnan have a chrY, and only dm6 and the 14 Chakraborty strains a
#   chrM.
#
# Every step keeps its output in the work dir and skips itself when that output
# is there, so a rerun after a failure starts where it stopped. The object name
# carries FORMAT, the row format HPRC's sidecar shares; the upload copies and
# never deletes.
#
# Usage: website/pangenome-config/buildFlySvStates.sh
#   FLY_SV_STATES_DIR  work dir (default /mnt/sdb/cdiesh/flySvStates)
#   FLY_GRAPH_DIR      the rGFA and *.pansn.fa
#                      (default /mnt/sdb/cdiesh/flyPangenome/build/graph)
#   MINIGRAPH_JOBS, MINIGRAPH_THREADS  concurrent calls and threads each (2, 4)
#   PUBLISH=0          build and stop before the upload
set -euo pipefail
cd "$(dirname "$0")"
source ../../lib/common.sh
source svStates.sh

WORK="${FLY_SV_STATES_DIR:-/mnt/sdb/cdiesh/flySvStates}"
GRAPH_DIR="${FLY_GRAPH_DIR:-/mnt/sdb/cdiesh/flyPangenome/build/graph}"
GFA="$GRAPH_DIR/fly-dm6-minigraph.rgfa.gz"
FORMAT=v2
DEST=jbrowse-data:jbrowse.org/pangenome/fly-dm6/sv-states
BASENAME=fly-dm6-minigraph
NAME="$BASENAME.sv-states.$FORMAT"
VCF="$WORK/$BASENAME.vcf.gz"
# dm6 first for merge2vcf's -r0, then the graph's construction order.
SAMPLES=(dm6 KSA2 QI2 Canton-S_A1 BER1_B1 BS1_A3 Wild5B_A6 A7 SAMry506_AB8
  OreR BOG1_A2 VAG1_A5 RVC3_B4 CA1_B2 B6 BDSC_5295 BDSC_620 BDSC_1349
  BDSC_1282 BDSC_554 BDSC_6027 BDSC_2969 BDSC_156 BDSC_1570 BDSC_576 BDSC_662
  A4_HiFi GUM_HiFi SAM_HiFi CantonS_Yunnan)

assert_bgzip_toolchain
mkdir -p "$WORK/calls" "$WORK/out"
exec > >(tee -a "$WORK/build.log") 2>&1
log "Building $NAME in $WORK from $GFA"

call_one() {
  local sample="$1" out="$WORK/calls/$1.call.bed"
  [ -s "$out" ] && return 0
  minigraph -cxasm --call -t"${MINIGRAPH_THREADS:-4}" "$GFA" \
    "$GRAPH_DIR/$sample.pansn.fa" >"$out.part" 2>"$WORK/calls/$sample.log"
  mv "$out.part" "$out"
}
export -f call_one
export WORK GRAPH_DIR GFA MINIGRAPH_THREADS
printf '%s\n' "${SAMPLES[@]}" >"$WORK/samples.txt"
if ! xargs -P "${MINIGRAPH_JOBS:-2}" -I{} bash -c 'call_one {}' <"$WORK/samples.txt"; then
  echo "minigraph --call failed; see $WORK/calls/*.log" >&2
  exit 1
fi
calls=()
for s in "${SAMPLES[@]}"; do calls+=("$WORK/calls/$s.call.bed"); done
lines=$(call_file_bubbles "${calls[@]}")
log "${#SAMPLES[@]} call files of $lines bubbles each"

if [ ! -s "$VCF" ]; then
  cp "$GRAPH_DIR/dm6.chrom.sizes" "$WORK/contigs.txt"
  minigraph_calls_to_vcf "$VCF" "$WORK/samples.txt" "$WORK/contigs.txt" 'dm6#1#' "${calls[@]}"
fi
records=$(bcftools index -n "$VCF")
log "$records records in $VCF, of $lines bubbles"

pack_minigraph_sv_states "$VCF" "$WORK/out/$NAME.tsv.gz"

cat >"$WORK/out/$NAME.README.txt" <<README
Drosophila melanogaster pangenome structural states, one row per bubble, for JBrowse 2
=====================================================================================

A derivative of the minigraph graph of 29 NCBI D. melanogaster assemblies on
dm6 (BDGP Release 6 + ISO1 MT) published at

  https://jbrowse.org/demos/fly_pangenome/$BASENAME.rgfa.gz

whose README.txt beside it names the assemblies and how the graph was built.
Each assembly was mapped back onto the graph with minigraph -cxasm --call, the
calls merged with mgutils.js merge and mgutils-es6.js merge2vcf -r0, and dm6's
column dropped. $NAME.tsv.gz holds every bubble with an allele at least 50 bp
long, as

  chrom  start(0-based)  end  id  states  genotypes

where id is the bubble's start and end segments, genotypes is one character
per assembly, in the order the first line names, and states says what each
character does to dm6's structure: 0 its own structure, v inverted (an allele
whose walk steps through a segment backwards), . no call (the assembly does
not align across the bubble, or lacks the chromosome: only CantonS_Yunnan has
a chrY, and only the 14 Chakraborty strains a chrM), and 1-9a-zA-Z a size
change to two significant figures (1:-1700 is a 1.7 kb deletion), ranked by
how many assemblies carry it. Rebuilt by
website/pangenome-config/buildFlySvStates.sh in https://github.com/GMOD/jb2hubs
with minigraph $(minigraph --version), $(bcftools --version | head -1),
$(bgzip --version | head -1) and node $(node --version).
README

publish_built "$WORK/out" "$DEST" "$NAME"
