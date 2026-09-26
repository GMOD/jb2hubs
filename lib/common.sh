#!/bin/bash
#
# lib/common.sh
#
# Shared configuration for all scripts.
# Source this file at the top of other scripts: source "$(dirname "$0")/../lib/common.sh"
#
# Control plane (both pipelines, incremental by default). Two independent env
# axes that compose:
#   REPROCESS=1      re-derive outputs from cached downloads, ignoring the
#                    change gates (implied by make.sh --reprocess-all).
#   FETCH_UPDATES=1  re-pull upstream NCBI GFFs even if a local copy exists;
#                    regeneration then cascades from the newer file.

# Suppress Node.js experimental warnings
export NODE_OPTIONS="--experimental-strip-types --no-warnings=ExperimentalWarning"

# The derivation half: whatever decides the bytes a derived file holds. Kept
# apart so ucsc2jbrowse/make.sh can hash it alone as a DERIVATION_SOURCE.
source "$(dirname "${BASH_SOURCE[0]}")/derive.sh"

# Suppress GNU parallel's citation notice everywhere; show the progress bar only
# when running interactively, because --bar is carriage-return animation that
# turns into hundreds of KB of overwritten whitespace in a log file.
#
# A function, not a bare assignment, because the answer changes inside one
# process. run.sh sources this file at the top -- to get parse_flags, before it
# knows whether it is even going to build -- and only redirects stdout into
# `tee` a hundred lines later. Measured: launched from a terminal it exports
# `--will-cite --bar`, and still holds that after the redirect, when stdout is
# the tee pipe. Nothing has been sprayed into logs/run_*.log only because every
# child re-sources this file after the redirect and recomputes; a child that
# used the inherited $PARALLEL_OPTS without re-sourcing would not. run.sh calls
# this again once the redirect is in place, so the exported value is right at
# the point it starts being inherited.
set_parallel_opts() {
  if [ -t 1 ]; then
    PARALLEL_OPTS="--will-cite --bar"
  else
    PARALLEL_OPTS="--will-cite"
  fi
  export PARALLEL_OPTS
}
set_parallel_opts

# CloudFront distribution that fronts jbrowse.org. Centralized so the upload
# scripts don't each hardcode the id.
export CLOUDFRONT_DISTRIBUTION_ID="E13LGELJOT4GQO"

# --- Shared flag parsing -----------------------------------------------------
#
# Every entry point (run.sh and both make.sh) accepts the same core flags with
# the same meaning. parse_flags owns those; a script handles its own extra flags
# by defining handle_flag, which returns non-zero for anything it doesn't know:
#
#   USAGE="Usage: $0 [OPTIONS]
#
#   Options:
#     --my-flag        Does the thing"
#   handle_flag() {
#     case "$1" in
#     --my-flag) MY_FLAG=true ;;
#     *) return 1 ;;
#     esac
#   }
#   parse_flags "$@"
#
# Shared help text lives here rather than in each script so the three --help
# outputs can't drift apart.
#
# shellcheck disable=SC2034 # PROCESS_ALL is read by the calling script
parse_flags() {
  local arg
  for arg in "$@"; do
    case "$arg" in
    --all)
      # Process every assembly/hub, not just new or changed ones. Derived
      # outputs are still skipped when their inputs are unchanged; use
      # --reprocess-all to force those too.
      PROCESS_ALL=true
      ;;
    --reprocess-all)
      PROCESS_ALL=true
      export REPROCESS=true
      ;;
    --explain)
      # Answer "what would this run do, and why" without doing it. The gates
      # here are all pure predicates over local stamps, so the report costs a
      # few hashes and no network -- see explain_stamp below for why that
      # restraint is the whole point.
      EXPLAIN=true
      ;;
    --help | -h)
      printf '%s\n' "$USAGE"
      printf '%s\n' "
  --all            Process every assembly/hub, not just new/changed ones
  --reprocess-all  Re-derive every output from cached downloads (implies --all).
                   Use after changing converter code or templates. Does not
                   re-pull NCBI GFFs unless FETCH_UPDATES=1.
  --explain        Report what a run would do and why, then exit without doing
                   it. Reads local stamps only: fetches nothing, writes nothing.
  --help, -h       Show this help message

Env vars (canonical description in lib/common.sh; they compose):
  REPROCESS=1      Re-derive outputs from cached downloads (implied by --reprocess-all)
  FETCH_UPDATES=1  Re-pull upstream NCBI GFFs in both pipelines"
      exit 0
      ;;
    *)
      if ! handle_flag "$arg"; then
        echo "Unknown option: $arg" >&2
        echo "Use --help for usage information" >&2
        exit 1
      fi
      ;;
    esac
  done
}

# Logs a message with a timestamp.
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}
export -f log

# Reports the failing jobs in a GNU parallel --joblog, given the exit status
# parallel itself returned. Prints nothing when every job succeeded; otherwise
# writes a count plus the first few failing command lines to stderr and returns
# non-zero, which is how run_parallel_reporting decides whether the log is worth
# keeping. Rows are Seq/Host/Starttime/JobRuntime/Send/Receive/Exitval/Signal/
# Command, so a job failed when either Exitval or Signal is set.
# Usage: _report_parallel_joblog <label> <joblog> <parallel-exit-status>
_report_parallel_joblog() {
  local label="$1" joblog="$2" status="${3:-0}" total=0 failed=0
  if [ -s "$joblog" ]; then
    total=$(awk 'END {print (NR > 0 ? NR - 1 : 0)}' "$joblog")
    failed=$(awk -F'\t' 'NR > 1 && ($7 != 0 || $8 != 0) {n++} END {print n + 0}' "$joblog")
  fi
  if [ "$failed" -eq 0 ]; then
    # parallel can fail without recording a job -- it could not start, or the
    # joblog never got written. Saying so beats reporting "all clear".
    if [ "$status" -ne 0 ]; then
      echo "WARNING: $label: parallel exited $status without recording a failing job" >&2
    fi
    return 0
  fi
  {
    echo "WARNING: $label: $failed of $total jobs failed"
    # The sample is capped inside awk rather than piped through head, so a
    # SIGPIPE cannot abort the reporting path in a `set -e` caller.
    awk -F'\t' -v max=10 'NR > 1 && ($7 != 0 || $8 != 0) {
      if (++n > max) exit
      cmd = $9
      for (i = 10; i <= NF; i++) cmd = cmd FS $i
      printf "  %s: %s\n", ($7 != 0 ? "exit " $7 : "signal " $8), cmd
    }' "$joblog"
    if [ "$failed" -gt 10 ]; then
      echo "  ... and $((failed - 10)) more"
    fi
    echo "  full job log: $joblog"
  } >&2
  return 1
}
export -f _report_parallel_joblog

# Runs GNU parallel over the job arguments on stdin, then says how many jobs
# failed and which. Tolerating a failed job is deliberate in the sweep scripts --
# one hub with broken chain files must not stop the other 50,700 -- but the bare
# `parallel ... || true` this replaces hid a systematic breakage exactly as well
# as it hid a one-off. Always returns 0, so a `set -e` caller keeps going.
# Everything after the label goes to parallel; PARALLEL_OPTS is added here.
# Usage: printf '%s\n' "${items[@]}" | run_parallel_reporting <label> [parallel args...]
run_parallel_reporting() {
  local label="$1"
  shift
  local joblog status=0
  joblog=$(mktemp)
  # shellcheck disable=SC2086 # PARALLEL_OPTS is a deliberate word-split list
  parallel --joblog "$joblog" $PARALLEL_OPTS "$@" || status=$?
  if _report_parallel_joblog "$label" "$joblog" "$status"; then
    rm -f "$joblog"
  fi
}
export -f run_parallel_reporting

# Counts changed objects in an rclone -v log: one line is printed per
# transferred/deleted object. Returns 0 (not an error) when nothing changed.
count_rclone_changes() {
  grep -cE ': (Copied|Deleted|Moved|Renamed)' "$1" || true
}
export -f count_rclone_changes

# Invalidates one or more CloudFront paths on the jbrowse.org distribution.
#
# CloudFront bills per path, so no caller may invalidate unconditionally, and
# as of 2026-08-27 none does -- audited, so the next reader does not have to:
# ucsc2jbrowse/uploadAll.sh and genark2jbrowse/uploadAll.sh both gate on the
# object count rclone_sync_with_indexes reports (genark invalidating only the
# prefixes that moved), website/pangenome-config/upload.sh on its
# upload_if_changed stamp, and website/deploy.sh's "/*" fires only after a
# release actually swapped the webroot symlink -- which run.sh in turn gates on
# genark, ucsc or website source having changed. Keep it that way when adding a
# caller: gate on a real change count, the way upload_if_changed gates uploads.
#
# Usage: cloudfront_invalidate "/ucsc/*" ["/processedHubJson/*" ...]
cloudfront_invalidate() {
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" --paths "$@"
}
export -f cloudfront_invalidate

# Uploads a local file to S3 only if it differs from the last upload, tracked
# via a local stamp file copy -- avoids needing S3 read permissions just to
# check for changes (every upload script here otherwise only ever writes),
# and avoids `aws s3 sync` having to list an entire large destination prefix
# just to check one small file. Prints "1" (uploaded) or "0" (unchanged) to
# stdout; diagnostics go to stderr. A missing local file is not an error: it
# just leaves the live copy alone and reports unchanged. An upload failure
# returns non-zero WITHOUT printing a status or touching the stamp, so a
# `changed=$(upload_if_changed ...)` caller under `set -e` aborts instead of
# silently recording a failed upload as done (bash's -e does not fire on a
# failing command mid-function when the function's own output is captured by
# a command substitution -- only the function's own final exit status does).
# Usage: changed=$(upload_if_changed <local-file> <s3-uri> <stamp-file>)
upload_if_changed() {
  local local_file="$1" s3_uri="$2" stamp_file="$3"
  if [ ! -f "$local_file" ]; then
    echo "$local_file not found locally; leaving the live copy unchanged." >&2
    echo 0
    return
  fi
  if diff -q "$local_file" "$stamp_file" >/dev/null 2>&1; then
    echo 0
    return
  fi
  if ! aws s3 cp "$local_file" "$s3_uri" >&2; then
    echo "upload_if_changed: failed to upload $local_file to $s3_uri" >&2
    return 1
  fi
  cp "$local_file" "$stamp_file"
  echo 1
}
export -f upload_if_changed

# Two-phase rclone sync shared by the upload scripts. First syncs data objects
# with normal caching (indexes excluded), then the .csi/.tbi indexes with
# Cache-Control: no-cache. An index stores byte offsets into its .gz; pairing a
# stale cached index with freshly-regenerated data lands offsets mid-bgzf-block
# ("invalid bgzf header"). Forcing the index to revalidate (cheap 304s via ETag)
# keeps it in lockstep with the data, while large .gz files keep normal caching
# so range requests during browsing aren't slowed by per-request revalidation.
#
# Extra args are passed only to the data phase (e.g. --exclude rules). Verbose
# rclone output goes to stderr; the changed-object count is printed to stdout.
#
# --checkers is deliberately low: the hasher source lives on a single spinning
# HDD, so many concurrent hashers just thrash the disk head on random seeks and
# collapse aggregate read throughput. Fewer parallel readers keeps the re-hash
# pass closer to sequential and faster. --fast-list does one recursive S3
# listing instead of many paginated LISTs across the deep object tree.
# Usage: changed=$(rclone_sync_with_indexes <src> <dest> [extra rclone args...])
rclone_sync_with_indexes() {
  local src="$1" dest="$2"
  shift 2
  local data_log idx_log
  data_log=$(mktemp)
  idx_log=$(mktemp)

  echo "Syncing data objects (cached MD5 hashes via rclone hasher)..." >&2
  rclone sync -c -v \
    --exclude "*.csi" --exclude "*.tbi" "$@" \
    "$src" "$dest" \
    --s3-storage-class INTELLIGENT_TIERING --fast-list --checkers 4 2>&1 | tee "$data_log" >&2

  echo "Syncing tabix/CSI indexes (Cache-Control: no-cache)..." >&2
  rclone sync -c -v \
    --include "*.csi" --include "*.tbi" \
    --header-upload "Cache-Control: no-cache" \
    "$src" "$dest" \
    --s3-storage-class INTELLIGENT_TIERING --fast-list --checkers 4 2>&1 | tee "$idx_log" >&2

  local changed=$(($(count_rclone_changes "$data_log") + $(count_rclone_changes "$idx_log")))
  rm -f "$data_log" "$idx_log"
  echo "$changed"
}
export -f rclone_sync_with_indexes

# Creates a directory if it doesn't exist.
#
# A symlink that does not resolve to a directory is replaced by a real one.
# hgdownload publishes several golden-path assemblies as symlinks (cb1 ->
# cbJul2002), and one of those landing in the downloads tree leaves a dangling
# link that `mkdir -p` refuses with "File exists" on every later run. Dropping
# the link cannot lose data -- only the link is removed, never its target, and a
# link that does resolve to a directory is left alone.
ensure_dir() {
  if [ -L "$1" ] && [ ! -d "$1" ]; then
    echo "ensure_dir: replacing dangling symlink $1 -> $(readlink "$1")" >&2
    rm -f "$1"
  fi
  mkdir -p "$1"
}
export -f ensure_dir

# Reports how many days ago a stamp file was touched, assigning it to the named
# variable. Returns non-zero when the stamp does not exist, so callers can treat
# "never run" and "run recently" distinctly.
# Usage: if stamp_age_days age "$stamp" && [ "$age" -lt 30 ]; then ...
stamp_age_days() {
  local -n _stamp_age_out=$1
  if [ ! -f "$2" ]; then
    return 1
  fi
  _stamp_age_out=$((($(date +%s) - $(stat -c %Y "$2")) / 86400))
}
export -f stamp_age_days

# Decides whether to hand an NCBI GFF to the downloader, given the local file
# whose existence proves the last fetch ran to completion. Returns 0 (fetch)
# when FETCH_UPDATES is set or that file is missing, else 1. This is the
# FETCH_UPDATES half of the control plane, as needs_rebuild below is the
# REPROCESS half.
#
# It is shared because both pipelines make this exact decision — genark's
# downloadNcbiGff.sh once per url while it builds its queue, ucsc's once per db
# — and neither could see the other drift. What differs stays with each caller,
# deliberately outside the gate:
#
#   - The witness file. genark names the download itself; ucsc names the .csi,
#     because its fetch also sorts, bgzips and indexes, and a run that died
#     mid-derivation leaves a .gff.gz no index answers for. Accepting that
#     .gff.gz as proof would ship an unindexable file indefinitely.
#   - What FETCH_UPDATES then does. genark hands the url to `wget -N`, a
#     conditional revalidation that re-pulls only when Last-Modified moved;
#     ucsc re-downloads outright, `datasets download` having no conditional
#     form. Both are "re-pull upstream NCBI GFFs", as --help says.
#
# Sets a status and prints nothing, so it is safe as an `if` condition under
# `set -e`, in a command substitution, and inside an exported parallel job.
# Usage: if needs_gff_fetch "$gff.csi"; then ...; fi
needs_gff_fetch() {
  if [ -n "${FETCH_UPDATES:-}" ] || [ ! -f "$1" ]; then
    return 0
  fi
  return 1
}
export -f needs_gff_fetch

# Deterministic content hash of a source tree: the code a derived output is a
# function of, as opposed to the data it was derived from. needs_rebuild covers
# the data half of that; this covers the half an incremental build otherwise
# cannot see, so a converter change invalidates outputs built by the old one.
#
# Hashes every regular file under the given paths, keyed by path relative to
# `root`, so the same tree at a different checkout location hashes the same
# while a rename inside it does not. `*.test.*` is excluded: a test cannot
# change what a build emits. A path that does not exist is an error rather than
# an empty contribution -- a caller whose source layout moved must fail loudly
# instead of quietly dropping that tree from the stamp and calling stale output
# fresh.
# Usage: hash=$(source_tree_hash <root> <path-relative-to-root>...)
source_tree_hash() {
  local root="$1"
  shift
  local p
  for p in "$@"; do
    if [ ! -e "$root/$p" ]; then
      echo "source_tree_hash: no such path: $root/$p" >&2
      return 1
    fi
  done
  (
    cd "$root" || exit 1
    find "$@" -type f ! -name '*.test.*' -print0 | sort -z | xargs -0 -r xxhsum -H3 2>/dev/null
  ) | xxhsum -H3 2>/dev/null | awk '{print $NF}'
}
export -f source_tree_hash

# Renders one stamp comparison for --explain. Three states, because the third is
# the one people misread: an ABSENT stamp bootstraps -- it records the current
# hash and re-derives nothing -- which looks identical to "unchanged" in every
# log line this pipeline writes, and is why a first run after a converter change
# can quietly ship the old outputs.
#
# It renders; it does not decide. The caller has already made the decision (into
# REDERIVE, or MODE) by the time it calls this, and passes the consequence in as
# text. A second copy of the comparison here would be a second source of truth
# for the question --explain exists to answer, and could disagree with the run
# it is describing -- which is exactly the failure mode, one level up.
#
# Usage: explain_stamp <label> <current-hash> <stamp-file> <consequence-if-changed>
explain_stamp() {
  local label="$1" current="$2" stamp_file="$3" consequence="$4" stored
  stored=$(cat "$stamp_file" 2>/dev/null || echo "")
  if [ -z "$stored" ]; then
    printf '  %-18s no stamp yet at %s\n' "$label:" "$stamp_file"
    printf '  %-18s bootstraps: records %s, re-derives nothing\n' "" "$current"
  elif [ "$stored" = "$current" ]; then
    printf '  %-18s unchanged (%s)\n' "$label:" "$current"
  else
    printf '  %-18s CHANGED %s -> %s\n' "$label:" "$stored" "$current"
    printf '  %-18s %s\n' "" "$consequence"
  fi
}
export -f explain_stamp
