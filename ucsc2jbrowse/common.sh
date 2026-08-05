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

# Directories under UCSC_DOWNLOADS_DIR that are not real assemblies: hgFixed is
# a shared metadata database, cb1 is a retired assembly UCSC still lists. Single
# source of truth for both the download loop and every "process all assemblies"
# pass, which previously each spelled the exclusion out themselves.
is_assembly_db() {
  case "$1" in
  hgFixed | cb1) return 1 ;;
  *) return 0 ;;
  esac
}
export -f is_assembly_db

# Lists the download directory of every real assembly, sorted.
list_assembly_dirs() {
  find "$UCSC_DOWNLOADS_DIR" -mindepth 1 -maxdepth 1 -type d \
    ! -name hgFixed ! -name cb1 | sort
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

# Sorts a file by (chrom, start) unless it is already sorted. The -c probe reads
# the file a second time but skips a full sort on the common already-sorted
# case, which matters for the largest golden-path tables.
sort_if_needed() {
  if sort -c -k1,1 -k2,2n "$1" >/dev/null 2>&1; then
    cat "$1"
  else
    sort -k1,1 -k2,2n "$1"
  fi
}
export -f sort_if_needed

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

# Runs an exported per-assembly function over the assembly directories given as
# arguments. A failed job aborts the caller (via set -e), which is what the
# config-building steps want: a half-built config must not reach later phases.
# Set PARALLEL_JOBS to cap concurrency for memory-hungry steps.
# Usage: run_for_assemblies <function> <dir>...
run_for_assemblies() {
  local fn="$1"
  shift
  require_assembly_args "$#"
  # shellcheck disable=SC2086 # PARALLEL_OPTS is a deliberate word-split list
  parallel ${PARALLEL_JOBS:+-j"$PARALLEL_JOBS"} $PARALLEL_OPTS _assembly_job "$fn" ::: "$@"
}

# Same, but a failed job only warns. For steps where one bad assembly should not
# stop the whole build (track derivation, metadata, text indexing): the outputs
# are per-assembly and the failed one simply rebuilds on the next run.
# Usage: run_for_assemblies_lenient <function> <label> <dir>...
run_for_assemblies_lenient() {
  local fn="$1" label="$2"
  shift 2
  require_assembly_args "$#"
  # shellcheck disable=SC2086 # PARALLEL_OPTS is a deliberate word-split list
  parallel ${PARALLEL_JOBS:+-j"$PARALLEL_JOBS"} $PARALLEL_OPTS _assembly_job "$fn" ::: "$@" ||
    echo "WARNING: parallel reported failures while $label (exit $?)" >&2
}
