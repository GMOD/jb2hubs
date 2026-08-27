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

# Locale for consistent sorting
export LC_ALL=C

# Suppress GNU parallel's citation notice everywhere; show progress bar only
# when running interactively.
if [ -t 1 ]; then
  PARALLEL_OPTS="--will-cite --bar"
else
  PARALLEL_OPTS="--will-cite"
fi
export PARALLEL_OPTS

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
    --help | -h)
      printf '%s\n' "$USAGE"
      printf '%s\n' "
  --all            Process every assembly/hub, not just new/changed ones
  --reprocess-all  Re-derive every output from cached downloads (implies --all).
                   Use after changing converter code or templates. Does not
                   re-pull NCBI GFFs unless FETCH_UPDATES=1.
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
ensure_dir() {
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

# Decides whether a derived output needs (re)building from a source file, using
# the source's XXH3 content hash as the change stamp recorded in a hash file.
# (Byte size was cheaper but missed same-size content changes — a re-published
# UCSC table that changes content but keeps its compressed size.)
# Returns 0 (needs rebuild) when REPROCESS or REDERIVE is set, the output or
# hash file is missing, or the source's hash differs from the recorded stamp;
# else 1.
#
# REDERIVE is the code half of the same question. This stamp only ever tracked
# the source *data*, so a change to the converter that derives the file left
# every existing output stale with nothing to notice — the same blind spot the
# per-assembly gate had, one level down. It cost a real bug: encodeGffAttribute
# started escaping control characters and dm6/droPer1's gff.gz kept their raw
# carriage returns, because their golden-path tables had not moved. The caller
# sets REDERIVE when its derivation sources changed (see make.sh); this does not
# hash anything itself, so the common path stays one xxhsum.
# Usage: if needs_rebuild out.bed.gz in.txt.gz out.hash; then ...; fi
needs_rebuild() {
  local output="$1" source="$2" hash_file="$3"
  local rebuild=0
  if [ -z "${REPROCESS:-}" ] && [ -z "${REDERIVE:-}" ] &&
    [ -f "$output" ] && [ -f "$hash_file" ]; then
    if [ "$(xxhsum -H3 "$source" | awk '{print $NF}')" = "$(cat "$hash_file")" ]; then
      rebuild=1
    fi
  fi
  return $rebuild
}
export -f needs_rebuild

# Records a source file's current XXH3 content hash into a hash file, for a later
# needs_rebuild check.
# Usage: save_rebuild_stamp in.txt.gz out.hash
save_rebuild_stamp() {
  xxhsum -H3 "$1" | awk '{print $NF}' >"$2"
}
export -f save_rebuild_stamp

# The bytes a derived .gz holds are a function of the bgzip BUILD, not only of
# the code in this repo. htslib 1.23.1 linked against libz emits ~6% larger
# output than the same version linked against libdeflate, and the decompressed
# content is byte-identical -- so every check here passes either way and nothing
# downstream can tell the two apart.
#
# That is not hypothetical. On 2026-08-27 a ~/.local htslib upgrade silently
# swapped the backend, and the next REDERIVE rewrote 5,757 files / 76.7GB with
# no content change at all. rclone -c saw genuinely different bytes and re-sent
# every one of them; worse, because the data and index objects are two separate
# passes, the run left fresh .gz against stale .csi in the bucket for every
# assembly it had reached -- "invalid bgzf header" on hg19 and hg38 in
# production, from an upgrade nobody connected to it.
#
# So pin the property that actually matters -- the bytes bgzip emits -- rather
# than a version string, which read "1.23.1" both before and after the swap and
# would have caught nothing.
#
# The canary input is deliberately large and varied. A short one hashes
# identically under htslib 1.13 and 1.23.1 even though those two disagree on
# real data (243569 vs 242051 bytes on the same bed), so a trivial canary would
# wave through exactly the kind of drift this exists to catch. Cost is ~0.09s.
BGZIP_TOOLCHAIN_SIGNATURE=6543e177be96fb685072546d230967b3

bgzip_canary_input() {
  awk 'BEGIN {
    s = 12345
    for (i = 1; i <= 60000; i++) {
      s = (s * 1103515245 + 12345) % 2147483648
      c = s % 24 + 1
      p = s % 250000000
      printf "chr%d\t%d\t%d\tfeat%d\t%d\t%s\n", c, p, p + (s % 5000), i, s % 1000, (s % 2 ? "+" : "-")
    }
  }'
}
export -f bgzip_canary_input

bgzip_toolchain_signature() {
  bgzip_canary_input | bgzip -c | md5sum | awk '{print $1}'
}
export -f bgzip_toolchain_signature

# Fails the run when bgzip would emit different bytes than the corpus was built
# with. Deliberately fatal rather than a warning: the failure it guards against
# is invisible in the output and only shows up as an unexplained multi-GB
# re-upload plus desynchronized indexes, which is precisely the shape of problem
# a warning gets scrolled past. ALLOW_BGZIP_DRIFT=1 overrides for a deliberate
# toolchain change -- which means committing the new signature and accepting
# that every derived .gz and .csi in the corpus will be rewritten and re-sent.
assert_bgzip_toolchain() {
  if [ -n "${ALLOW_BGZIP_DRIFT:-}" ]; then
    echo "WARNING: ALLOW_BGZIP_DRIFT set; skipping bgzip toolchain check" >&2
    return 0
  fi
  local actual
  actual=$(bgzip_toolchain_signature)
  if [ "$actual" != "$BGZIP_TOOLCHAIN_SIGNATURE" ]; then
    {
      echo "ERROR: bgzip emits different bytes than this corpus was built with."
      echo "  expected signature: $BGZIP_TOOLCHAIN_SIGNATURE"
      echo "  this bgzip:         $actual"
      echo "  bgzip in use:       $(command -v bgzip) ($(bgzip --version 2>&1 | head -1))"
      echo
      echo "Every derived .gz and .csi would be rewritten with identical content"
      echo "and re-uploaded. Usually this means a different htslib is first on"
      echo "PATH, or the same htslib was rebuilt against a different compression"
      echo "backend (libz vs libdeflate)."
      echo
      echo "To accept it: re-run with ALLOW_BGZIP_DRIFT=1 and commit the new"
      echo "signature as BGZIP_TOOLCHAIN_SIGNATURE in lib/common.sh."
    } >&2
    return 1
  fi
}
export -f assert_bgzip_toolchain

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
    find "$@" -type f ! -name '*.test.*' -print0 | sort -z | xargs -0 -r xxhsum -H3
  ) | xxhsum -H3 | awk '{print $NF}'
}
export -f source_tree_hash

# Hashes the newline-separated paths on stdin, emitting "hash<TAB>path" rows.
# xxhsum's native output is BSD-style "XXH3 (path) = hash"; converting once here
# means the rest of make_file_listing can treat the listing as plain TSV instead
# of re-parsing that format at every step.
_hash_paths() {
  xargs -d '\n' -r xxhsum -H3 |
    sed -E 's/^XXH3 \((.*)\) = ([0-9a-f]+)$/\2\t\1/'
}
export -f _hash_paths

# Incrementally updates a hash listing file using XXH3. Rows are "hash<TAB>path"
# sorted by path, under a format-tag header line. Re-hashes files newer than the
# listing plus any file missing from it; additions, modifications and deletions
# are all reflected. Changing the tag retires older listings automatically: they
# fail the header check and get rebuilt from scratch.
# Usage: make_file_listing <listing> <find_dir> [extra_find_args...]
make_file_listing() {
  local listing="$1" find_dir="$2"
  shift 2
  local extra_args=("$@")
  local algo_tag="# algo=xxh3-tsv"

  if [[ ! -d "$find_dir" ]]; then
    echo "ERROR: $find_dir does not exist or is not mounted, aborting to preserve existing listing" >&2
    return 1
  fi

  local tmp_cur tmp_new
  tmp_cur=$(mktemp)
  tmp_new=$(mktemp)

  find "$find_dir" -type f "${extra_args[@]}" | sort >"$tmp_cur"

  # No listing yet, or one in an older format: hash everything.
  if [[ ! -f "$listing" ]] || ! head -1 "$listing" | grep -qF "$algo_tag"; then
    {
      echo "$algo_tag"
      _hash_paths <"$tmp_cur" | sort -t $'\t' -k2,2
    } >"$listing"
    rm -f "$tmp_cur" "$tmp_new"
    return 0
  fi

  # Nothing left to list. Handled separately because the merge below relies on
  # its first input being non-empty (see the awk comment).
  if [[ ! -s "$tmp_cur" ]]; then
    echo "$algo_tag" >"$listing"
    rm -f "$tmp_cur" "$tmp_new"
    return 0
  fi

  # Hash files modified since the previous listing was written, plus any file
  # absent from it. The second half matters because -newer only matches files
  # modified after the previous run finished, so a write-once file (e.g.
  # *.gff.gz) created earlier would otherwise never be recorded.
  {
    find "$find_dir" -type f "${extra_args[@]}" -newer "$listing"
    comm -23 "$tmp_cur" <(tail -n +2 "$listing" | cut -f2- | sort)
  } | sort -u | _hash_paths >"$tmp_new"

  # Merge: a freshly hashed row wins over the cached one for the same path, and
  # a cached row survives only while its file still exists. tmp_cur is
  # guaranteed non-empty here, which is what makes the NR==FNR pass safe -- an
  # empty first input would make awk read the second file as the path set.
  {
    echo "$algo_tag"
    awk -F'\t' 'NR==FNR{cur[$0];next} ($2 in cur) && !seen[$2]++' \
      "$tmp_cur" "$tmp_new" <(tail -n +2 "$listing") | sort -t $'\t' -k2,2
  } >"${listing}.tmp"
  mv "${listing}.tmp" "$listing"
  rm -f "$tmp_cur" "$tmp_new"
}
export -f make_file_listing
