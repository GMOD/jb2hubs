#!/bin/bash
#
# lib/common.test.sh
#
# Tests for helpers in lib/common.sh: make_file_listing, parse_flags,
# needs_gff_fetch, needs_rebuild / save_rebuild_stamp, source_tree_hash,
# rclone_sync_with_indexes, assert_bgzip_toolchain and run_parallel_reporting.
# Run: ./lib/common.test.sh
#

set -uo pipefail
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

count_entries() { tail -n +2 "$1" 2>/dev/null | grep -c . || true; }
hash_of() { awk -F'\t' -v p="$1" '$2 == p {print $1}' "$2"; }

work=$(mktemp -d)
data="$work/data"
listing="$work/listing.txt"
mkdir -p "$data"

# Initial build hashes every file.
echo a >"$data/a.txt"
echo b >"$data/b.txt"
make_file_listing "$listing" "$data"
check "initial build hashes all files" 2 "$(count_entries "$listing")"

# A re-run with nothing changed must preserve every entry (the old two-pass
# awk wiped the listing whenever no file was newer than it).
make_file_listing "$listing" "$data"
check "unchanged re-run preserves entries" 2 "$(count_entries "$listing")"

# Regression: a write-once file older than the listing must still be recorded.
# The previous implementation only added files -newer than the listing, so a
# pre-existing data file like this was silently dropped.
echo c >"$data/c.txt"
touch -d '2000-01-01' "$data/c.txt"
make_file_listing "$listing" "$data"
check "older write-once file gets added" 3 "$(count_entries "$listing")"

# Deletion is reflected.
rm "$data/a.txt"
make_file_listing "$listing" "$data"
check "deleted file is removed" 2 "$(count_entries "$listing")"

# Modification re-hashes the file.
before=$(hash_of "$data/b.txt" "$listing")
echo bbbb >"$data/b.txt"
make_file_listing "$listing" "$data"
after=$(hash_of "$data/b.txt" "$listing")
if [[ -n "$after" && "$before" != "$after" ]]; then
  echo "ok   - modified file is re-hashed"
else
  echo "FAIL - modified file not re-hashed (before='$before' after='$after')"
  fail=1
fi

# No duplicate entries for any path.
dupes=$(tail -n +2 "$listing" | cut -f2- | sort | uniq -d)
check "no duplicate path entries" "" "$dupes"

# A path containing spaces stays on one row and round-trips through the merge.
echo spaced >"$data/has space.txt"
make_file_listing "$listing" "$data"
check "path with spaces is recorded" 3 "$(count_entries "$listing")"
spaced_hash=$(hash_of "$data/has space.txt" "$listing")
make_file_listing "$listing" "$data"
check "path with spaces survives a re-run" "$spaced_hash" "$(hash_of "$data/has space.txt" "$listing")"

# A listing in a retired format is rebuilt from scratch rather than merged.
printf '# algo=xxh3\nXXH3 (%s) = deadbeef\n' "$data/b.txt" >"$listing"
make_file_listing "$listing" "$data"
check "stale-format listing is rebuilt" 3 "$(count_entries "$listing")"
check "stale-format listing gets the new header" "# algo=xxh3-tsv" "$(head -1 "$listing")"

# An empty directory empties the listing instead of preserving stale rows.
rm -f "$data"/*
make_file_listing "$listing" "$data"
check "empty directory yields an empty listing" 0 "$(count_entries "$listing")"

# A missing directory is refused, leaving the previous listing untouched.
echo keep >"$data/keep.txt"
make_file_listing "$listing" "$data"
before_missing=$(cat "$listing")
if make_file_listing "$listing" "$work/not-a-dir" 2>/dev/null; then
  echo "FAIL - missing directory should return non-zero"
  fail=1
else
  echo "ok   - missing directory returns non-zero"
fi
check "missing directory preserves the listing" "$before_missing" "$(cat "$listing")"

rm -rf "$work"

# --- parse_flags ---

USAGE="Usage: fake [OPTIONS]"
handle_flag() {
  case "$1" in
  --extra) EXTRA=true ;;
  *) return 1 ;;
  esac
}

# Each case runs in a subshell: parse_flags exits the shell on --help and on an
# unknown flag, and exports REPROCESS.
probe_flags() (
  PROCESS_ALL=false EXTRA=false EXPLAIN=false
  parse_flags "$@"
  echo "all=$PROCESS_ALL extra=$EXTRA reprocess=${REPROCESS:-} explain=$EXPLAIN"
)

check "no flags leaves everything off" "all=false extra=false reprocess= explain=false" "$(probe_flags)"
check "--all sets PROCESS_ALL" "all=true extra=false reprocess= explain=false" "$(probe_flags --all)"
check "--reprocess-all implies --all" "all=true extra=false reprocess=true explain=false" "$(probe_flags --reprocess-all)"
check "script-specific flags reach handle_flag" "all=false extra=true reprocess= explain=false" "$(probe_flags --extra)"
check "flags compose" "all=true extra=true reprocess=true explain=false" "$(probe_flags --extra --reprocess-all)"

# --explain is orthogonal: it reports on whatever the other flags select, so it
# must not imply or suppress any of them.
check "--explain sets EXPLAIN alone" "all=false extra=false reprocess= explain=true" "$(probe_flags --explain)"
check "--explain composes with --reprocess-all" "all=true extra=false reprocess=true explain=true" \
  "$(probe_flags --reprocess-all --explain)"

(probe_flags --nope) >/dev/null 2>&1
check "unknown flag exits non-zero" "1" "$?"
check "unknown flag reports on stderr" "Unknown option: --nope" \
  "$( (probe_flags --nope) 2>&1 >/dev/null | head -1)"

help_out=$( (probe_flags --help) 2>/dev/null)
check "--help prints the caller's usage" "Usage: fake [OPTIONS]" "$(echo "$help_out" | head -1)"
case "$help_out" in
*--reprocess-all*FETCH_UPDATES*)
  echo "ok   - --help appends the shared flag and env-var help"
  ;;
*)
  echo "FAIL - --help omitted the shared help block"
  fail=1
  ;;
esac

unset -f handle_flag
unset USAGE

# --- needs_gff_fetch ---
# The witness is whatever file proves the caller's last fetch finished: the
# download itself in genark, the .csi in ucsc, where bgzip and tabix follow it.

gf=$(mktemp -d)
witness="$gf/hg38.gff.gz.csi"

if needs_gff_fetch "$witness"; then echo "ok   - fetch when the witness is missing"; else
  echo "FAIL - fetch when the witness is missing"
  fail=1
fi

touch "$witness"
if needs_gff_fetch "$witness"; then
  echo "FAIL - skip when the witness exists"
  fail=1
else echo "ok   - skip when the witness exists"; fi

# FETCH_UPDATES re-pulls a GFF we already hold: NCBI can re-annotate in place
# under the same accession, which nothing local would otherwise notice.
if FETCH_UPDATES=1 needs_gff_fetch "$witness"; then echo "ok   - fetch when FETCH_UPDATES set"; else
  echo "FAIL - fetch when FETCH_UPDATES set"
  fail=1
fi

# Status only: a caller reading it inside a command substitution gets nothing.
check "the gate prints nothing" "" "$(FETCH_UPDATES=1 needs_gff_fetch "$witness" 2>&1)"

# set -e is the mode both downloaders run under, and a skip is the common case.
check "a skip does not abort a set -e caller" "skip" "$(
  set -e
  if needs_gff_fetch "$witness"; then echo fetch; else echo skip; fi
)"

# Exported, so the parallel jobs both downloaders export can call it.
check "the gate is exported to child shells" "fetch" \
  "$(bash -c 'if needs_gff_fetch /nonexistent/gff.gz.csi; then echo fetch; else echo skip; fi')"

rm -rf "$gf"

# --- needs_rebuild / save_rebuild_stamp ---

rb=$(mktemp -d)
src="$rb/in.txt.gz"
out="$rb/out.bed.gz"
hash="$rb/out.hash"
printf 'aaaa' >"$src" # 4-byte source

# No output yet -> needs rebuild.
if needs_rebuild "$out" "$src" "$hash"; then echo "ok   - rebuild when output missing"; else
  echo "FAIL - rebuild when output missing"
  fail=1
fi

# Output + matching stamp -> no rebuild. The output has to have content: an
# empty one is what a derivation that exited 0 without producing anything leaves
# behind, and save_rebuild_stamp refuses to stamp that (tested at the end).
printf 'derived' >"$out"
save_rebuild_stamp "$out" "$src" "$hash"
if needs_rebuild "$out" "$src" "$hash"; then
  echo "FAIL - skip when stamp matches"
  fail=1
else echo "ok   - skip when stamp matches"; fi

# Source changes size -> needs rebuild.
printf 'aaaaaaaa' >"$src"
if needs_rebuild "$out" "$src" "$hash"; then echo "ok   - rebuild when source size changes"; else
  echo "FAIL - rebuild when source size changes"
  fail=1
fi

# Same byte size but different content -> needs rebuild. Byte-size stamping
# missed this; the XXH3 content hash catches it.
printf 'bbbbbbbb' >"$src"
save_rebuild_stamp "$out" "$src" "$hash"
printf 'cccccccc' >"$src" # still 8 bytes, different content
if needs_rebuild "$out" "$src" "$hash"; then echo "ok   - rebuild when content changes at identical size"; else
  echo "FAIL - rebuild when content changes at identical size"
  fail=1
fi

# REPROCESS forces rebuild even when the stamp matches.
save_rebuild_stamp "$out" "$src" "$hash"
if REPROCESS=1 needs_rebuild "$out" "$src" "$hash"; then echo "ok   - rebuild when REPROCESS set"; else
  echo "FAIL - rebuild when REPROCESS set"
  fail=1
fi

# Missing hash file -> needs rebuild.
rm -f "$hash"
if needs_rebuild "$out" "$src" "$hash"; then echo "ok   - rebuild when hash file missing"; else
  echo "FAIL - rebuild when hash file missing"
  fail=1
fi

# REDERIVE forces a rebuild even when the source stamp matches: the stamp tracks
# the source data only, so it cannot see a change in the code deriving the file.
# Skipping here is what left dm6/droPer1's gff.gz holding raw carriage returns
# after encodeGffAttribute was fixed, since their tables had not moved.
printf 'stable' >"$src"
save_rebuild_stamp "$out" "$src" "$hash"
if needs_rebuild "$out" "$src" "$hash"; then
  echo "FAIL - skip when stamp matches and REDERIVE unset"
  fail=1
else
  echo "ok   - skip when stamp matches and REDERIVE unset"
fi
if REDERIVE=1 needs_rebuild "$out" "$src" "$hash"; then echo "ok   - rebuild when REDERIVE set"; else
  echo "FAIL - rebuild when REDERIVE set"
  fail=1
fi

# --- save_rebuild_stamp refuses to stamp an output that was not produced ---
#
# The stamp means "this derivation is done", and nothing used to check that the
# thing it was supposed to derive exists. A recipe that exits 0 having written
# nothing would be recorded as done and skipped by every later run -- the
# durable half of the failure, since the missing file is then named by a config
# forever and no rebuild is ever attempted. Both shapes are the same bug: an
# absent output, and a zero-byte one from a redirect whose producer wrote
# nothing.
missing="$rb/never-written.bed.gz"
mstamp="$rb/never-written.hash"
if save_rebuild_stamp "$missing" "$src" "$mstamp" 2>/dev/null; then
  echo "FAIL - refuse to stamp a missing output"
  fail=1
else echo "ok   - refuse to stamp a missing output"; fi
check "no stamp file written for a missing output" "absent" \
  "$([ -f "$mstamp" ] && echo present || echo absent)"

: >"$missing" # zero bytes: the redirect ran, the producer wrote nothing
if save_rebuild_stamp "$missing" "$src" "$mstamp" 2>/dev/null; then
  echo "FAIL - refuse to stamp an empty output"
  fail=1
else echo "ok   - refuse to stamp an empty output"; fi
check "no stamp file written for an empty output" "absent" \
  "$([ -f "$mstamp" ] && echo present || echo absent)"

# The refusal has to leave the next run rebuilding rather than skipping, which
# is the whole point of not writing the stamp.
if needs_rebuild "$missing" "$src" "$mstamp"; then
  echo "ok   - a refused stamp leaves the output needing a rebuild"
else
  echo "FAIL - a refused stamp leaves the output needing a rebuild"
  fail=1
fi

# It says which output it refused on: the caller is a parallel job over
# thousands of files, so a bare failure is not findable. Captured rather than
# piped -- under `set -o pipefail` the pipeline would take this function's
# deliberate non-zero status, not grep's.
refusal=$(save_rebuild_stamp "$missing" "$src" "$mstamp" 2>&1 || true)
check "the refusal names the output" "yes" \
  "$(echo "$refusal" | grep -q "never-written.bed.gz" && echo yes || echo no)"
check "the refusal names the stamp it withheld" "yes" \
  "$(echo "$refusal" | grep -q "never-written.hash" && echo yes || echo no)"

rm -rf "$rb"

# --- explain_stamp ---
#
# The three states, and specifically that an absent stamp reports as a bootstrap
# rather than as "unchanged". Conflating those two is the misreading --explain
# exists to prevent: a bootstrapping stamp re-derives nothing, which is correct,
# but is indistinguishable from a clean incremental run in every line the
# pipeline otherwise logs.
es=$(mktemp -d)
es_stamp="$es/.pipeline_hash"

check "absent stamp reports a bootstrap" "yes" \
  "$(explain_stamp code abc123 "$es_stamp" 'consequence' | grep -q bootstraps && echo yes || echo no)"
check "absent stamp does not report unchanged" "no" \
  "$(explain_stamp code abc123 "$es_stamp" 'consequence' | grep -q unchanged && echo yes || echo no)"

printf 'abc123\n' >"$es_stamp"
check "matching stamp reports unchanged" "yes" \
  "$(explain_stamp code abc123 "$es_stamp" 'consequence' | grep -q 'unchanged (abc123)' && echo yes || echo no)"
check "matching stamp does not print the consequence" "no" \
  "$(explain_stamp code abc123 "$es_stamp" 'every hub is stale' | grep -q 'every hub is stale' && echo yes || echo no)"

printf 'old999\n' >"$es_stamp"
check "differing stamp reports the transition" "yes" \
  "$(explain_stamp code abc123 "$es_stamp" 'consequence' | grep -q 'CHANGED old999 -> abc123' && echo yes || echo no)"
check "differing stamp prints the caller's consequence" "yes" \
  "$(explain_stamp code abc123 "$es_stamp" 'every hub is stale' | grep -q 'every hub is stale' && echo yes || echo no)"

# It reports; it must never write. A --explain that stamped would make the run
# it just described unnecessary.
check "explain_stamp does not touch the stamp" "old999" "$(cat "$es_stamp")"

rm -rf "$es"

# --- rclone_sync_with_indexes ---
# Stub rclone so the test is hermetic. count_rclone_changes counts one line per
# changed object; the helper runs rclone twice (data phase + index phase), so the
# reported total is double the stub's per-call count. stdout must be exactly that
# total, with verbose rclone output kept off stdout.
rc=$(mktemp -d)
cat >"$rc/rclone" <<'STUB'
#!/bin/bash
echo "2024/01/01 INFO  : file1.gz: Copied (new)"
echo "2024/01/01 INFO  : file2.gz: Copied (replaced existing)"
echo "2024/01/01 INFO  : old.gz: Deleted"
echo "verbose noise that must not reach stdout" >&2
STUB
chmod +x "$rc/rclone"

out=$(PATH="$rc:$PATH" rclone_sync_with_indexes src: dest: --exclude '*.hash' 2>/dev/null)
check "rclone_sync_with_indexes sums data+index changes" 6 "$out"

cat >"$rc/rclone" <<'STUB'
#!/bin/bash
echo "2024/01/01 INFO  : There was nothing to transfer"
STUB
chmod +x "$rc/rclone"

out=$(PATH="$rc:$PATH" rclone_sync_with_indexes src: dest: 2>/dev/null)
check "rclone_sync_with_indexes reports 0 when nothing changed" 0 "$out"

rm -rf "$rc"

# --- source_tree_hash ---
# This is the stamp that makes a converter change invalidate built configs, so
# every property below is load-bearing: a miss ships stale output silently, and
# a spurious change reprocesses hundreds of assemblies for nothing.
st=$(mktemp -d)
mkdir -p "$st/src/nested" "$st/data"
echo one >"$st/src/a.ts"
echo two >"$st/src/nested/b.ts"
echo three >"$st/data/c.json"

base=$(source_tree_hash "$st" src data)
check "stable across runs" "$base" "$(source_tree_hash "$st" src data)"

# The whole point: an edit anywhere in the tree changes the hash.
echo edited >"$st/src/nested/b.ts"
if [[ "$base" != "$(source_tree_hash "$st" src data)" ]]; then
  echo "ok   - content edit changes the hash"
else
  echo "FAIL - content edit changes the hash"
  fail=1
fi
echo two >"$st/src/nested/b.ts"
check "reverting an edit restores the hash" "$base" "$(source_tree_hash "$st" src data)"

# Paths are hashed too, so moving a file is a change even when no byte of any
# file differs -- which for a converter it is.
mv "$st/src/a.ts" "$st/src/renamed.ts"
if [[ "$base" != "$(source_tree_hash "$st" src data)" ]]; then
  echo "ok   - rename changes the hash"
else
  echo "FAIL - rename changes the hash"
  fail=1
fi
mv "$st/src/renamed.ts" "$st/src/a.ts"

# Tests cannot change what a build emits; reprocessing every assembly because a
# test file moved would be pure cost.
echo t >"$st/src/a.test.ts"
check "test files are excluded" "$base" "$(source_tree_hash "$st" src data)"
rm "$st/src/a.test.ts"

# Keyed on paths relative to the root, so a different checkout location (or the
# same tree copied elsewhere) produces the same stamp.
st2=$(mktemp -d)
cp -r "$st/src" "$st/data" "$st2/"
check "same tree at another path hashes the same" "$base" "$(source_tree_hash "$st2" src data)"
rm -rf "$st2"

# A path that does not exist must fail loudly. Silently contributing nothing is
# how a renamed source directory would drop out of the stamp and start shipping
# stale configs again.
if source_tree_hash "$st" src nonexistent >/dev/null 2>&1; then
  echo "FAIL - missing path is an error"
  fail=1
else
  echo "ok   - missing path is an error"
fi

# An empty tree still yields a hash rather than an empty string (an empty stamp
# would compare equal to a missing stamp file).
mkdir -p "$st/empty"
if [[ -n "$(source_tree_hash "$st" empty)" ]]; then
  echo "ok   - empty tree still yields a hash"
else
  echo "FAIL - empty tree still yields a hash"
  fail=1
fi

rm -rf "$st"

# --- run_parallel_reporting / _report_parallel_joblog ---
# The reporting half is tested against synthetic job logs, so it runs whether or
# not GNU parallel is installed; the end-to-end case below needs the real thing.
pj=$(mktemp -d)
joblog="$pj/joblog"
write_joblog() {
  printf 'Seq\tHost\tStarttime\tJobRuntime\tSend\tReceive\tExitval\tSignal\tCommand\n' >"$joblog"
  printf '%s\n' "$@" >>"$joblog"
}
job_row() { printf '%s\t:\t1700000000.000\t0.01\t0\t0\t%s\t%s\t%s' "$1" "$2" "$3" "$4"; }

write_joblog "$(job_row 1 0 0 'run one')" "$(job_row 2 3 0 'run two')" "$(job_row 3 0 0 'run three')"
report=$(_report_parallel_joblog 'probe' "$joblog" 3 2>&1)
check "reporting a failure returns non-zero" 1 "$?"
check "failure count names the total" "WARNING: probe: 1 of 3 jobs failed" "$(echo "$report" | head -1)"
check "the failing argument is printed" "  exit 3: run two" "$(echo "$report" | sed -n 2p)"
case "$report" in
*"full job log: $joblog"*) echo "ok   - the report names the job log" ;;
*)
  echo "FAIL - the report omitted the job log path"
  fail=1
  ;;
esac

# A job killed by a signal records Exitval 0, so Signal has to be read too.
write_joblog "$(job_row 1 0 9 'killed one')"
report=$(_report_parallel_joblog 'probe' "$joblog" 1 2>&1)
check "a signalled job counts as failed" "  signal 9: killed one" "$(echo "$report" | sed -n 2p)"

# Every job succeeded: silence, and a zero return so the caller drops the log.
write_joblog "$(job_row 1 0 0 'run one')" "$(job_row 2 0 0 'run two')"
report=$(_report_parallel_joblog 'probe' "$joblog" 0 2>&1)
check "a clean run returns zero" 0 "$?"
check "a clean run prints nothing" "" "$report"

# parallel failing without recording a job (it could not start, say) must not
# read as all clear.
: >"$joblog"
report=$(_report_parallel_joblog 'probe' "$joblog" 127 2>&1)
check "an unrecorded parallel failure is still reported" \
  "WARNING: probe: parallel exited 127 without recording a failing job" "$report"

# The sample is capped, and the remainder counted rather than dropped.
rows=()
for i in $(seq 1 12); do rows+=("$(job_row "$i" 1 0 "run $i")"); done
write_joblog "${rows[@]}"
report=$(_report_parallel_joblog 'probe' "$joblog" 12 2>&1)
check "the sample is capped at ten" 10 "$(echo "$report" | grep -c '^  exit 1: ')"
check "the remainder is counted" "  ... and 2 more" "$(echo "$report" | grep '\.\.\. and')"

if command -v parallel >/dev/null; then
  # TMPDIR is redirected so the job logs this leaves behind are countable: one
  # kept for the failing run, none for the clean one.
  runs="$pj/runs"
  mkdir -p "$runs"
  report=$(printf 'a\nb\nc\n' | TMPDIR="$runs" run_parallel_reporting 'probe' '[ {} != b ]' 2>&1 >/dev/null)
  check "run_parallel_reporting never fails its caller" 0 "$?"
  check "a real failing job is counted" "WARNING: probe: 1 of 3 jobs failed" "$(echo "$report" | head -1)"
  case "$report" in
  *"[ b != b ]"*) echo "ok   - the failing job's argument is named" ;;
  *)
    echo "FAIL - the failing job's argument was not named"
    fail=1
    ;;
  esac
  check "a failing run keeps its job log" 1 "$(find "$runs" -type f | grep -c . || true)"

  rm -f "$runs"/*
  report=$(printf 'a\nc\n' | TMPDIR="$runs" run_parallel_reporting 'probe' '[ {} != b ]' 2>&1 >/dev/null)
  check "a clean run stays silent" "" "$report"
  check "a clean run leaves no job log behind" 0 "$(find "$runs" -type f | grep -c . || true)"

  # set -e is the mode every caller runs under: a failed job must not abort it.
  check "a failed job does not abort a set -e caller" "survived" \
    "$(
      set -e
      printf 'b\n' | run_parallel_reporting 'probe' '[ {} != b ]' 2>/dev/null
      echo survived
    )"
else
  echo "skip - run_parallel_reporting end-to-end (GNU parallel not installed)"
fi

rm -rf "$pj"
unset -f write_joblog job_row

# --- assert_bgzip_toolchain ---
# The signature pins the BYTES bgzip emits, not its version string: the incident
# that motivated it was htslib 1.23.1 rebuilt against libz instead of libdeflate,
# where the version was identical before and after. So the test that matters is
# that a different backend at the same version is rejected.
#
# What this file can assert is the MECHANISM -- deterministic, big enough to
# tell builds apart, rejects a different build, honours the override. Whether
# *this* host's bgzip matches the pin is a fact about the host, not about the
# code, and the enforcement for that is assert_bgzip_toolchain being fatal in
# both make.sh files before any derivation runs. Asserting it here instead made
# the suite unrunnable anywhere but the build box: CI has no bgzip at all, so
# `bgzip: command not found` failed this file, and because the workflow step
# runs under `bash -e` that took lib/chainpif.test.sh and
# genark2jbrowse/addNcbiGffAndTextIndex.test.sh down with it -- three suites
# that had therefore never run in CI. Reported, not failed, unless
# BGZIP_STRICT=1 asks for the build box's question.
#
if command -v bgzip >/dev/null 2>&1; then
  check "signature is deterministic across runs" \
    "$(bgzip_toolchain_signature)" "$(bgzip_toolchain_signature)"

  if assert_bgzip_toolchain 2>/dev/null; then
    echo "ok   - current bgzip matches the pinned signature"
  elif [ -n "${BGZIP_STRICT:-}" ]; then
    echo "FAIL - current bgzip does not match BGZIP_TOOLCHAIN_SIGNATURE"
    echo "       (if the toolchain changed deliberately, re-pin it; see lib/common.sh)"
    fail=1
  else
    echo "note - this host's bgzip does not match BGZIP_TOOLCHAIN_SIGNATURE, so"
    echo "       make.sh would refuse to derive here. That is the guard working."
    echo "       Set BGZIP_STRICT=1 to make it a failure (do so on the build box)."
  fi
else
  # An absent bgzip is a fact about the runner, but assert_bgzip_toolchain must
  # still say so rather than reporting a hash of nothing as a toolchain change.
  bgzip_msg=$(assert_bgzip_toolchain 2>&1 || true)
  case "$bgzip_msg" in
  *"not on PATH"*)
    echo "ok   - a missing bgzip is named as such, not as a signature mismatch"
    ;;
  *)
    echo "FAIL - a missing bgzip was not reported as a missing bgzip"
    echo "       (got '$bgzip_msg')"
    fail=1
    ;;
  esac
  echo "skip - pinned-signature match (no bgzip on this host)"
fi

# A canary that only exercises trivially-compressible input hashes the same
# under htslib 1.13 and 1.23.1, both of which link libdeflate but disagree on
# real data. Assert the input is big enough to tell builds apart at all.
bg_bytes=$(bgzip_canary_input | wc -c | tr -d ' ')
if [ "$bg_bytes" -gt 1000000 ]; then
  echo "ok   - canary input is large enough to expose level mapping ($bg_bytes bytes)"
else
  echo "FAIL - canary input is only $bg_bytes bytes; too small to tell builds apart"
  fail=1
fi

if command -v /usr/bin/bgzip >/dev/null 2>&1 &&
  ! /usr/bin/bgzip --version 2>&1 | head -1 | grep -q "1.23.1"; then
  bgd=$(mktemp -d)
  ln -s /usr/bin/bgzip "$bgd/bgzip"
  if PATH="$bgd:$PATH" assert_bgzip_toolchain >/dev/null 2>&1; then
    echo "FAIL - a different bgzip build was not detected"
    fail=1
  else
    echo "ok   - a different bgzip build is rejected"
  fi
  if PATH="$bgd:$PATH" ALLOW_BGZIP_DRIFT=1 assert_bgzip_toolchain >/dev/null 2>&1; then
    echo "ok   - ALLOW_BGZIP_DRIFT overrides the check"
  else
    echo "FAIL - ALLOW_BGZIP_DRIFT did not override the check"
    fail=1
  fi
  rm -rf "$bgd"
else
  echo "skip - drift detection (no second bgzip build available to compare)"
fi

[[ $fail -eq 0 ]] && echo "All tests passed" || echo "Some tests failed"
exit $fail
