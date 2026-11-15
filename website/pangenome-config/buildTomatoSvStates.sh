#!/bin/bash
# Builds and publishes the structural-state sidecar of the tomato graph, to
# s3://jbrowse.org/pangenome/tomato-microtom/sv-states/, in the row format
# buildHprcSvStates.sh writes and `pangenomeSvStates.ts` reads.
#
# - **The graph records no paths, so the build maps each assembly back onto
#   it**, as buildRiceSvStates.sh does: `minigraph -cxasm --call` per assembly
#   against the whole-genome graph, then `mgutils.js merge` and
#   `mgutils-es6.js merge2vcf -r0` (`svStates.sh`).
# - **The inputs are build_tomato_pangenome.sh's** (jbrowse-components): the
#   rGFA, the graph/<name>.pansn.fa files it built the graph from, and
#   panel.tsv, whose second column names the members in construction order,
#   Micro-Tom first.
# - **MicroTom is the reference column, not a haplotype**, dropped as dm6 is.
# - **Every member has the twelve chromosomes and nothing else**: the graph
#   build refuses an assembly lacking one, so no chromosome is a no call.
# - **A call holds the graph's index, about 2x rice's**: a rice call peaked at
#   18.7 GB, so run one at a time inside a memory cap (`systemd-run --user
#   --scope -p MemoryMax=...`), so an overrun kills a call, never the box; each
#   call's log ends with its peak RSS.
##
# Every step keeps its output in the work dir and skips itself when that output
# is there, so a rerun after a failure starts where it stopped. The object name
# carries FORMAT, the row format HPRC's sidecar shares; the upload copies and
# never deletes.
#
# Usage: website/pangenome-config/buildTomatoSvStates.sh
#   TOMATO_SV_STATES_DIR  work dir (default /mnt/sdb/cdiesh/tomatoSvStates)
#   TOMATO_BUILD_DIR      build_tomato_pangenome.sh's output dir
#                       (default /mnt/sdb/cdiesh/tomatoPangenome/build)
#   MINIGRAPH_JOBS, MINIGRAPH_THREADS  concurrent calls and threads each (1, 8)
#   PUBLISH=0           build and stop before the upload
set -euo pipefail
cd "$(dirname "$0")"
source ../../lib/common.sh
source svStates.sh

WORK="${TOMATO_SV_STATES_DIR:-/mnt/sdb/cdiesh/tomatoSvStates}"
BUILD="${TOMATO_BUILD_DIR:-/mnt/sdb/cdiesh/tomatoPangenome/build}"
GRAPH_DIR="$BUILD/graph"
BASENAME=tomato-microtom-minigraph
GFA="$BUILD/$BASENAME.rgfa.gz"
FORMAT=v2
DEST=jbrowse-data:jbrowse.org/pangenome/tomato-microtom/sv-states
NAME="$BASENAME.sv-states.$FORMAT"
VCF="$WORK/$BASENAME.vcf.gz"
REFERENCE=MicroTom

mapfile -t SAMPLES < <(cut -f2 "$BUILD/panel.tsv")
if [ "${#SAMPLES[@]}" -lt 2 ] || [ "${SAMPLES[0]}" != "$REFERENCE" ]; then
  echo "$BUILD/panel.tsv must list $REFERENCE first and then the panel; it has ${#SAMPLES[@]} row(s)" >&2
  exit 1
fi

assert_bgzip_toolchain
mkdir -p "$WORK/calls" "$WORK/out"
exec > >(tee -a "$WORK/build.log") 2>&1
log "Building $NAME in $WORK from $GFA, ${#SAMPLES[@]} assemblies"

call_one() {
  local sample="$1" out="$WORK/calls/$1.call.bed"
  [ -s "$out" ] && return 0
  minigraph -cxasm --call -t"${MINIGRAPH_THREADS:-8}" "$GFA" \
    "$GRAPH_DIR/$sample.pansn.fa" >"$out.part" 2>"$WORK/calls/$sample.log"
  mv "$out.part" "$out"
}
export -f call_one
export WORK GRAPH_DIR GFA MINIGRAPH_THREADS
printf '%s\n' "${SAMPLES[@]}" >"$WORK/samples.txt"
if ! xargs -P "${MINIGRAPH_JOBS:-1}" -I{} bash -c 'call_one {}' <"$WORK/samples.txt"; then
  echo "minigraph --call failed; see $WORK/calls/*.log" >&2
  exit 1
fi
log "peak RSS per call: $(grep -ho 'Peak RSS: [0-9.]* GB' "$WORK"/calls/*.log | awk '{print $3}' | sort -n | sed -n '1p;$p' | paste -sd-) GB"
calls=()
for s in "${SAMPLES[@]}"; do calls+=("$WORK/calls/$s.call.bed"); done
lines=$(call_file_bubbles "${calls[@]}")
log "${#SAMPLES[@]} call files of $lines bubbles each"

if [ ! -s "$VCF" ]; then
  cp "$GRAPH_DIR/$REFERENCE.chrom.sizes" "$WORK/contigs.txt"
  minigraph_calls_to_vcf "$VCF" "$WORK/samples.txt" "$WORK/contigs.txt" "$REFERENCE#1#" "${calls[@]}"
fi
records=$(bcftools index -n "$VCF")
log "$records records in $VCF, of $lines bubbles"

pack_minigraph_sv_states "$VCF" "$WORK/out/$NAME.tsv.gz"

cat >"$WORK/out/$NAME.README.txt" <<README
Tomato pangenome structural states, one row per bubble, for JBrowse 2
=====================================================================

A derivative of the minigraph graph of $((${#SAMPLES[@]} - 1)) chromosome-scale NCBI tomato and wild
Solanum assemblies on Micro-Tom SLM_r2.1 (GCF_036512215.1) published at

  https://jbrowse.org/demos/tomato_pangenome/$BASENAME.rgfa.gz

whose README.txt beside it names the assemblies and how the graph was built.
Each assembly was mapped back onto the graph with minigraph -cxasm --call, the
calls merged with mgutils.js merge and mgutils-es6.js merge2vcf -r0, and
MicroTom's column dropped. $NAME.tsv.gz holds every bubble with an allele at
least 50 bp long, as

  chrom  start(0-based)  end  id  states  genotypes

where id is the bubble's start and end segments, genotypes is one character
per assembly, in the order the first line names, and states says what each
character does to Micro-Tom's structure: 0 its own structure, v inverted (an
allele whose walk steps through a segment backwards), . no call (the assembly
does not align across the bubble, as wild species' divergent sequence often
does not), and 1-9a-zA-Z a size change to two significant figures (1:-1700 is
a 1.7 kb deletion), ranked by how many assemblies carry it. Rebuilt by
website/pangenome-config/buildTomatoSvStates.sh in
https://github.com/GMOD/jb2hubs with minigraph $(minigraph --version),
$(bcftools --version | head -1), $(bgzip --version | head -1) and node $(node --version).
README

publish_built "$WORK/out" "$DEST" "$NAME"
