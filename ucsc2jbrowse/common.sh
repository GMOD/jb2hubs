#!/bin/bash
#
# common.sh
#
# Shared configuration for ucsc2jbrowse scripts.
# Source this file at the top of other scripts: source "$(dirname "$0")/common.sh"
#

# Source the shared lib/common.sh for utilities common to both pipelines
source "$(dirname "$0")/../lib/common.sh"

# Set the root directories for UCSC data and results.
# Can be overridden by setting environment variables.
: "${UCSC_DOWNLOADS_DIR:=/mnt/sdb/cdiesh/jb2hubs/ucscDownloads}"
: "${UCSC_BUILT_DIR:=/mnt/sdb/cdiesh/jb2hubs/ucscBuilt}"
export UCSC_DOWNLOADS_DIR UCSC_BUILT_DIR

# Track families we deliberately do NOT materialize from the golden-path
# database tables, because they are huge and/or extremely numerous: per-sample
# SNP tables (snp*) and the entire ENCODE collection (wgEncode*). Converting,
# storing, and uploading them isn't worth it.
#
# This is the single source of truth for that policy, applied uniformly by the
# bed/gene/rmsk track builders. For some passes a given prefix never matches
# (e.g. no rmsk table is named snp*), so the gate is simply a no-op there — but
# keeping one rule means there's a single place to reason about and tune it.
is_skipped_track() {
  case "$1" in
  snp* | wgEncode*) return 0 ;;
  *) return 1 ;;
  esac
}
export -f is_skipped_track

# hgFixed is the one directory under UCSC_DOWNLOADS_DIR that is not an assembly:
# it is UCSC's shared metadata database (asmEquivalent and friends), rsynced
# deliberately by make.sh and absent from the genome list. Single source of truth
# for both the download loop and every "process all assemblies" pass, which
# previously each spelled the exclusion out themselves.
#
# cb1 was excluded here too, from the pipeline's first commit and with no reason
# ever recorded, and that was simply wrong: it is an active entry in UCSC's
# genome list (nib-era, one 108Mb chrUn) with a browser, a trackDb and a 2bit.
# Excluding it did not stop us publishing a config for it -- the copy step takes
# the genome list's own keys -- it only stopped that config ever being
# regenerated or given data. What shipped was an advertised browser naming a
# bigZips 2bit and chrom.sizes that have never existed, so loadPre() rejected and
# genomes.jbrowse.org/ucsc/cb1 could not open at all. The track-url canary is
# what finally said so, daily, from 2026-08-28.
is_assembly_db() {
  case "$1" in
  hgFixed) return 1 ;;
  *) return 0 ;;
  esac
}
export -f is_assembly_db

# Lists the download directory of every real assembly, sorted.
list_assembly_dirs() {
  find "$UCSC_DOWNLOADS_DIR" -mindepth 1 -maxdepth 1 -type d \
    ! -name hgFixed | sort
}
export -f list_assembly_dirs

# Sets assembly_name / assembly_results_dir / db_dir from an assembly's download
# directory. Callers declare the three names local first, so bash's dynamic
# scoping keeps them scoped to the caller rather than leaking as globals:
#   local assembly_name assembly_results_dir db_dir
#   assembly_paths "$1"
# shellcheck disable=SC2034 # all three are consumed by the caller
assembly_paths() {
  assembly_name=$(basename "$1")
  assembly_results_dir="$UCSC_BUILT_DIR/$assembly_name"
  db_dir="$1/$assembly_name/database"
}
export -f assembly_paths


# GNU parallel runs exported functions in a fresh bash that does NOT inherit the
# parent's `set -euo pipefail`. Every per-assembly job is wrapped in this so a
# failing derivation step (geneLike, bed2gff, bgzip, tabix, ...) aborts the job
# instead of being ignored and letting the run reach save_rebuild_stamp, which
# would permanently cache a broken track. Failing here leaves the stamp unwritten
# so the track rebuilds next run.
_assembly_job() {
  set -eo pipefail
  "$@"
}
export -f _assembly_job

# Usage guard shared by the per-assembly scripts, all of which take a list of
# assembly directories as their arguments.
require_assembly_args() {
  if [ "$1" -eq 0 ]; then
    echo "Usage: $0 <assembly_dir1> [assembly_dir2] ..." >&2
    exit 1
  fi
}

# Says how much of a phase went where, in one line. The per-assembly derivation
# phases are the longest thing in the pipeline and printed NOTHING while they
# ran: on 2026-09-07 the BED phase was 37m56s, RepeatMasker 8m14s and gene
# tracks 9m40s, and the only reason those three numbers are knowable at all is
# that the `log` lines marking their boundaries were recovered afterwards from
# inside a 298KB single line of xxhsum carriage returns. Naming the assemblies
# that dominated is the part worth having -- the totals are already visible from
# the phase timestamps, but "which of the 217 took the time" was not recorded
# anywhere.
# Usage: _report_assembly_timing <label> <joblog>
_report_assembly_timing() {
  local label="$1" joblog="$2" done_count slowest
  if [ ! -s "$joblog" ]; then
    return 0
  fi
  done_count=$(awk 'END {print (NR > 1 ? NR - 1 : 0)}' "$joblog")
  if [ "$done_count" -eq 0 ]; then
    return 0
  fi
  # Column 4 is JobRuntime, and the command's last argument is the assembly's
  # download directory, so its basename is the assembly name.
  slowest=$(awk -F'\t' 'NR > 1 { name = $NF; sub(/.*\//, "", name); printf "%.0f %s\n", $4, name }' "$joblog" |
    sort -rn | head -3 | awk '{printf " %s(%ss)", $2, $1}')
  echo "  $label: $done_count assemblies, slowest:$slowest"
}

# Shared body of the two runners below. An empty `label` means strict: the
# caller's `set -e` must see the failure, so the status is returned. A non-empty
# one means lenient, and is what the failure report is titled with.
#
# When ASSEMBLY_FAILURES_FILE is set, the name of every assembly whose job failed
# is appended to it. make.sh reads it to leave those assemblies unstamped, since
# a failed job also skipped every table after the one that failed.
_run_assembly_jobs() {
  local fn="$1" label="$2"
  shift 2
  local joblog status=0
  joblog=$(mktemp)
  # shellcheck disable=SC2086 # PARALLEL_OPTS is a deliberate word-split list
  parallel --joblog "$joblog" ${PARALLEL_JOBS:+-j"$PARALLEL_JOBS"} $PARALLEL_OPTS \
    _assembly_job "$fn" ::: "$@" || status=$?
  _report_assembly_timing "${label:-$fn}" "$joblog"
  if [ -n "${ASSEMBLY_FAILURES_FILE:-}" ]; then
    awk -F'\t' 'NR > 1 && ($7 != 0 || $8 != 0) { name = $NF; sub(/.*\//, "", name); print name }' \
      "$joblog" >>"$ASSEMBLY_FAILURES_FILE"
  fi
  # Keeps the joblog only when it named failures, so the "full job log" the
  # report points at still exists -- same contract as run_parallel_reporting.
  if _report_parallel_joblog "${label:-$fn}" "$joblog" "$status"; then
    rm -f "$joblog"
  fi
  if [ -z "$label" ]; then
    return "$status"
  fi
}

# Runs an exported per-assembly function over the assembly directories given as
# arguments. A failed job aborts the caller (via set -e), which is what the
# config-building steps want: a half-built config must not reach later phases.
# Set PARALLEL_JOBS to cap concurrency for memory-hungry steps.
# Usage: run_for_assemblies <function> <dir>...
run_for_assemblies() {
  local fn="$1"
  shift
  require_assembly_args "$#"
  _run_assembly_jobs "$fn" "" "$@"
}

# Same, but a failed job only warns. For steps where one bad assembly should not
# stop the whole build (track derivation, metadata, text indexing): the outputs
# are per-assembly and the failed one simply rebuilds on the next run.
#
# It now names WHICH assemblies failed, via the same _report_parallel_joblog the
# genark sweeps use. "parallel reported failures (exit 1)" was all this said,
# and that is the shape criGriChoV1 hid behind for months: tabix refused an
# 80MB gff.gz, this warned, the run carried on, and the config shipped naming an
# index that was never written. A count hides a systematic breakage exactly as
# well as it hides a one-off.
# Usage: run_for_assemblies_lenient <function> <label> <dir>...
run_for_assemblies_lenient() {
  local fn="$1" label="$2"
  shift 2
  require_assembly_args "$#"
  _run_assembly_jobs "$fn" "$label" "$@"
}

# Removes a configs/<name>.json that the copy loop will never write again and
# that is demonstrably not a config. `configs/` is an append-only mirror --
# make.sh copies a built config in, and nothing ever took one out -- which is how
# `ucscRenames/hg38.json` rode in as `configs/renames.json` and fed four
# unpkg.com plugin urls into all.json for a year.
#
# Deliberately narrow: a file goes only when it is both absent from the wanted
# list AND has no `assemblies[0].name`, the same discriminator
# checkPluginUrls.mjs keys on. That combination is junk, and deleting it needs no
# judgement. A real config whose db UCSC stopped listing keeps its file and gets
# a warning instead -- retiring a db that published links still name is a human
# decision, and scripts/checkOrphanConfigs.mjs fails the deploy over it.
#
# Usage: prune_stray_configs <dir> <wanted-names-file>
prune_stray_configs() {
  local dir="$1" wanted="$2" f name pruned=0
  if [ ! -d "$dir" ]; then
    echo "prune_stray_configs: $dir does not exist" >&2
    return 1
  fi
  # An empty list makes every file look stray. This function deletes, and its
  # input arrives over the network, so refuse rather than act vacuously.
  if [ ! -s "$wanted" ]; then
    echo "prune_stray_configs: $wanted is empty; refusing to prune $dir" >&2
    return 1
  fi
  for f in "$dir"/*.json; do
    [ -f "$f" ] || continue
    name=$(basename "$f" .json)
    if grep -qxF "$name" "$wanted"; then
      continue
    fi
    if jq -e '.assemblies[0].name' "$f" >/dev/null 2>&1; then
      echo "WARNING: $dir/$name.json is a config for a db the UCSC genome list no longer has. Left in place; retiring it is a human decision." >&2
      continue
    fi
    echo "Pruning $dir/$name.json: not in the UCSC genome list and not an assembly config."
    rm -f "$f"
    pruned=$((pruned + 1))
  done
  if [ "$pruned" -gt 0 ]; then
    log "Pruned $pruned stray file(s) from $dir."
  fi
}
