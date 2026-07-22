#!/bin/bash
#
# common.test.sh
#
# Tests for the ucsc2jbrowse shared helpers: assembly listing/path derivation and
# the per-assembly parallel runners.
# Run: ./common.test.sh
#

set -uo pipefail

work=$(mktemp -d)
export UCSC_DOWNLOADS_DIR="$work/downloads"
export UCSC_BUILT_DIR="$work/built"
mkdir -p "$UCSC_DOWNLOADS_DIR" "$UCSC_BUILT_DIR"

source "$(cd "$(dirname "$0")" && pwd)/common.sh"

fail=0
check() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "ok   - $desc"
  else
    echo "FAIL - $desc (expected '$expected', got '$actual')"
    fail=1
  fi
}

# --- is_assembly_db / list_assembly_dirs ---

if is_assembly_db hg38 && ! is_assembly_db hgFixed && ! is_assembly_db cb1; then
  echo "ok   - is_assembly_db excludes hgFixed and cb1"
else
  echo "FAIL - is_assembly_db classified a database wrongly"
  fail=1
fi

mkdir -p "$UCSC_DOWNLOADS_DIR"/{hg38,mm39,hgFixed,cb1}
check "list_assembly_dirs skips non-assemblies" \
  "$UCSC_DOWNLOADS_DIR/hg38 $UCSC_DOWNLOADS_DIR/mm39" "$(list_assembly_dirs | tr '\n' ' ' | sed 's/ $//')"

# --- assembly_paths ---

probe() {
  local assembly_name assembly_results_dir db_dir
  assembly_paths "$1"
  echo "$assembly_name|$assembly_results_dir|$db_dir"
}
check "assembly_paths derives name, results dir and db dir" \
  "hg38|$UCSC_BUILT_DIR/hg38|$UCSC_DOWNLOADS_DIR/hg38/hg38/database" \
  "$(probe "$UCSC_DOWNLOADS_DIR/hg38")"

# The three names must not survive as globals when the caller declares them.
check "assembly_paths does not leak globals" "" "${assembly_name:-}"

# --- sort_if_needed ---

printf 'chr1\t10\nchr1\t2\n' >"$work/unsorted.bed"
check "sort_if_needed sorts an unsorted file" \
  "chr1 2 chr1 10" "$(sort_if_needed "$work/unsorted.bed" | tr '\n\t' '  ' | sed 's/ $//')"

printf 'chr1\t2\nchr1\t10\n' >"$work/sorted.bed"
check "sort_if_needed passes a sorted file through" \
  "chr1 2 chr1 10" "$(sort_if_needed "$work/sorted.bed" | tr '\n\t' '  ' | sed 's/ $//')"

# --- run_for_assemblies / run_for_assemblies_lenient ---

# Silence parallel's progress bar so job output is the only thing on the pipe.
# shellcheck disable=SC2034 # read by the runners in common.sh
PARALLEL_OPTS="--will-cite"

touched() { touch "$UCSC_BUILT_DIR/$(basename "$1").done"; }
export -f touched
run_for_assemblies touched "$UCSC_DOWNLOADS_DIR/hg38" "$UCSC_DOWNLOADS_DIR/mm39"
check "run_for_assemblies runs every job" "2" \
  "$(find "$UCSC_BUILT_DIR" -name '*.done' | wc -l)"

# A job whose first command fails must abort rather than run on: this is what
# stops a broken derivation from reaching save_rebuild_stamp.
reached_end() {
  false
  touch "$UCSC_BUILT_DIR/should-not-exist"
}
export -f reached_end
run_for_assemblies reached_end "$UCSC_DOWNLOADS_DIR/hg38" 2>/dev/null
check "_assembly_job aborts a job after a failed step" "1" "$?"
if [ -f "$UCSC_BUILT_DIR/should-not-exist" ]; then
  echo "FAIL - job continued past a failed step"
  fail=1
else
  echo "ok   - job did not continue past a failed step"
fi

# The lenient runner reports the failure but returns success, so one bad
# assembly does not stop the build.
out=$(run_for_assemblies_lenient reached_end "testing" "$UCSC_DOWNLOADS_DIR/hg38" 2>&1)
check "run_for_assemblies_lenient survives a failed job" "0" "$?"
case "$out" in
*"WARNING: parallel reported failures while testing"*)
  echo "ok   - run_for_assemblies_lenient reports the failure"
  ;;
*)
  echo "FAIL - run_for_assemblies_lenient did not warn (got '$out')"
  fail=1
  ;;
esac

# No arguments is a usage error, not a silent no-op over everything.
(run_for_assemblies touched) >/dev/null 2>&1
check "run_for_assemblies rejects an empty assembly list" "1" "$?"

rm -rf "$work"

if [ "$fail" -eq 0 ]; then
  echo "All tests passed"
else
  echo "Some tests FAILED"
  exit 1
fi
