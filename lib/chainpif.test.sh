#!/bin/bash
#
# lib/chainpif.test.sh
#
# Tests for the pure (network-free) helpers in lib/chainpif.sh.
# Run: ./lib/chainpif.test.sh
#

set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/chainpif.sh"

fail=0
check() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "ok   - $desc"
  else
    echo "FAIL - $desc"
    echo "       expected: $expected"
    echo "       actual:   $actual"
    fail=1
  fi
}

# A representative Apache-style directory listing.
listing='<html><body>
<a href="../">Parent Directory</a>
<a href="hg38ToHg19.over.chain.gz">hg38ToHg19.over.chain.gz</a>
<a href="hg38ToHg19.over.chain.gz.md5sum">md5</a>
<a href="hg38ToMm39.over.chain.gz">hg38ToMm39.over.chain.gz</a>
<a href="vsHg19/">vsHg19/</a>
<a href="vsMm39/">vsMm39/</a>
</body></html>'

# Chain files (md5sum filtering is done by the caller, so it is still listed here).
got=$(printf '%s\n' "$listing" | parse_href_listing '\.over\.chain\.gz$')
check "parse_href_listing keeps only .over.chain.gz hrefs" \
  "hg38ToHg19.over.chain.gz
hg38ToMm39.over.chain.gz" "$got"

# 'vs*' subdirectory listing.
got=$(printf '%s\n' "$listing" | parse_href_listing '^vs.*/$')
check "parse_href_listing matches vs* subdirs" \
  "vsHg19/
vsMm39/" "$got"

# No matches yields empty output (and exit 0, not a pipeline failure).
got=$(printf '%s\n' "$listing" | parse_href_listing '\.nonexistent$')
check "parse_href_listing returns empty for no matches" "" "$got"

# extract_file_urls: only a 404 may read as "no chains", because the caller
# stamps an empty listing and never lists that directory again.
curl() {
  local out
  while [ $# -gt 0 ]; do
    [ "$1" = -o ] && out="$2"
    shift
  done
  printf '%s\n' "$listing" >"$out"
  printf '%s' "$stub_status"
  return "$stub_rc"
}
stub_status=200 stub_rc=0
check "extract_file_urls: a 200 listing yields its hrefs" \
  "hg38ToHg19.over.chain.gz
hg38ToMm39.over.chain.gz" "$(extract_file_urls https://example.org/ '\.over\.chain\.gz$')"
stub_status=404
check "extract_file_urls: a 404 is an empty listing" "0:" \
  "$(out=$(extract_file_urls https://example.org/ '\.over\.chain\.gz$' 2>/dev/null); echo "$?:$out")"
stub_status=503
check "extract_file_urls: a 503 fails rather than reading as empty" "1" \
  "$( (extract_file_urls https://example.org/ '\.over\.chain\.gz$') >/dev/null 2>&1; echo $?)"
stub_status=000 stub_rc=7
check "extract_file_urls: a refused connection fails too" "1" \
  "$( (extract_file_urls https://example.org/ '\.over\.chain\.gz$') >/dev/null 2>&1; echo $?)"
unset -f curl
unset stub_status stub_rc

# generate_file_paths derives chain + pif paths from the configured dirs.
CHAINS_DIR=/tmp/chains
PIFS_DIR=/tmp/pifs
got=$(generate_file_paths "hg38ToHg19.over.chain.gz" ".over.chain.gz")
check "generate_file_paths (.over.chain.gz)" \
  "/tmp/chains/hg38ToHg19.over.chain.gz
/tmp/pifs/hg38ToHg19.pif.gz" "$got"

got=$(generate_file_paths "chr1.all.chain.gz" ".all.chain.gz")
check "generate_file_paths (.all.chain.gz)" \
  "/tmp/chains/chr1.all.chain.gz
/tmp/pifs/chr1.pif.gz" "$got"

# CLI stamps: a PIF or a liftOver dir built by another make-pif is rebuilt.
# Priming the memo is what stubs the version here, so the suite needs no
# node_modules -- and a stamp check that ever forked the CLI again would fail
# against JBROWSE_CLI below rather than quietly costing a process per hub.
JBROWSE_CLI=false
export JBROWSE_CLI_VERSION="@jbrowse/cli version 5.0.0-test"
tmp=$(mktemp -d)
check "pif_stamp_current: missing stamp is stale" "stale" \
  "$(pif_stamp_current "$tmp/.checked" && echo current || echo stale)"
touch "$tmp/.checked"
check "pif_stamp_current: the pre-5.0 empty touch stamp is stale" "stale" \
  "$(pif_stamp_current "$tmp/.checked" && echo current || echo stale)"
echo "@jbrowse/cli version 4.2.1" >"$tmp/.checked"
check "pif_stamp_current: another CLI's stamp is stale" "stale" \
  "$(pif_stamp_current "$tmp/.checked" && echo current || echo stale)"
write_pif_stamp "$tmp/.checked"
check "write_pif_stamp records the current CLI" "current" \
  "$(pif_stamp_current "$tmp/.checked" && echo current || echo stale)"

touch "$tmp/a.pif.gz" "$tmp/a.pif.gz.csi"
check "pif_current: pif + index without a stamp is stale" "stale" \
  "$(pif_current "$tmp/a.pif.gz" && echo current || echo stale)"
write_pif_stamp "$tmp/a.pif.gz.cli"
check "pif_current: pif + index + current stamp" "current" \
  "$(pif_current "$tmp/a.pif.gz" && echo current || echo stale)"
rm "$tmp/a.pif.gz.csi"
check "pif_current: a stamp does not excuse a missing index" "stale" \
  "$(pif_current "$tmp/a.pif.gz" && echo current || echo stale)"
rm -r "$tmp"

# The memo, which is the difference between the genark gate taking seconds and
# taking 21 minutes: it runs once per hub, so asking the CLI its version there
# is a node process per hub. A counting stub answers whether it is asked twice.
tmp=$(mktemp -d)
printf '#!/bin/bash\necho x >>"%s/asked"\necho "@jbrowse/cli version 5.0.0-test"\n' \
  "$tmp" >"$tmp/jbrowse"
chmod +x "$tmp/jbrowse"
JBROWSE_CLI="$tmp/jbrowse"
unset JBROWSE_CLI_VERSION
# Written by hand rather than by write_pif_stamp, which would prime the memo
# itself -- the cold gate loop in genark2jbrowse/make.sh is the case under test.
echo "@jbrowse/cli version 5.0.0-test" >"$tmp/.checked"
for _ in 1 2 3; do pif_stamp_current "$tmp/.checked"; done
check "the CLI is asked its version once per shell, not once per stamp" "1" \
  "$(wc -l <"$tmp/asked")"
check "and the memoized answer still matches the stamp" "current" \
  "$(pif_stamp_current "$tmp/.checked" && echo current || echo stale)"

# A pipe subshell's memo dies with it, so the parent must load it before the
# gate pipeline for the parallel jobs to inherit it.
: >"$tmp/asked"
unset JBROWSE_CLI_VERSION
load_jbrowse_cli_version
printf '%s\n' a b | while read -r _; do pif_stamp_current "$tmp/.checked"; done |
  bash -c 'test -n "$JBROWSE_CLI_VERSION"'
check "a loaded memo reaches the pipeline's jobs" "0:1" "$?:$(wc -l <"$tmp/asked")"

printf '#!/bin/bash\n' >"$tmp/jbrowse"
unset JBROWSE_CLI_VERSION
check "a CLI that prints no version is an error" "1" \
  "$( (load_jbrowse_cli_version) >/dev/null 2>&1; echo $?)"

JBROWSE_CLI=false
export JBROWSE_CLI_VERSION="@jbrowse/cli version 5.0.0-test"
rm -r "$tmp"

# A UCSC liftOver stamp ages out, so a chain added upstream later is found.
tmp=$(mktemp -d)
write_pif_stamp "$tmp/.checked"
check "a fresh liftOver stamp is current" "current" \
  "$(liftover_stamp_current "$tmp/.checked" && echo current || echo stale)"
touch -d '40 days ago' "$tmp/.checked"
check "a liftOver stamp older than LIFTOVER_RECHECK_DAYS is stale" "stale" \
  "$(liftover_stamp_current "$tmp/.checked" && echo current || echo stale)"
rm -r "$tmp"

# chain_to_paf tells a chain that will not decompress (exit 2) apart from one
# chain2paf refused (exit 1), which is what lets create_pif refetch the first.
# chain2paf is stubbed; pigz is real, because the truncation is the subject.
tmp=$(mktemp -d)
printf 'chain 100 chr1 1000 + 0 100 chr1 1000 + 0 100 1\n100\n\n' |
  pigz >"$tmp/good.chain.gz"
head -c 20 "$tmp/good.chain.gz" >"$tmp/truncated.chain.gz"

chain2paf() { cat >/dev/null; }
check "chain_to_paf: a good chain converts" "0" \
  "$(chain_to_paf "$tmp/good.chain.gz" "$tmp/out.paf" >/dev/null 2>&1; echo $?)"
check "chain_to_paf: a truncated chain is 2, not a conversion failure" "2" \
  "$(chain_to_paf "$tmp/truncated.chain.gz" "$tmp/out.paf" >/dev/null 2>&1; echo $?)"

chain2paf() { cat >/dev/null; return 1; }
check "chain_to_paf: chain2paf refusing good input is 1" "1" \
  "$(chain_to_paf "$tmp/good.chain.gz" "$tmp/out.paf" >/dev/null 2>&1; echo $?)"

# An early chain2paf exit SIGPIPEs pigz. On a chain bigger than a pipe buffer
# that is a non-zero pigz status on good input, which must still read as 1.
head -c 8000000 /dev/urandom | pigz >"$tmp/big.chain.gz"
chain2paf() { head -c 10 >/dev/null; return 1; }
check "chain_to_paf: an early chain2paf exit on a good chain is 1" "1" \
  "$(chain_to_paf "$tmp/big.chain.gz" "$tmp/out.paf" >/dev/null 2>&1; echo $?)"

# create_pif repairs the corrupt cached copy rather than failing every run.
# The download and make-pif are stubbed; the refetch is what is under test.
chain2paf() { cat >/dev/null; }
download_file() { cp "$tmp/good.chain.gz" "$2"; }
JBROWSE_CLI=true # make-pif; the version is already memoized above
cp "$tmp/truncated.chain.gz" "$tmp/cached.chain.gz"
out=$(create_pif "$tmp/cached.chain.gz" "$tmp/cached.pif.gz" \
  https://example.org/cached.chain.gz 2>&1)
check "create_pif: a corrupt cached chain is refetched" "0" \
  "$(pigz -t "$tmp/cached.chain.gz" 2>/dev/null; echo $?)"
check "create_pif: and the PIF is stamped afterwards" "current" \
  "$(pif_stamp_current "$tmp/cached.pif.gz.cli" && echo current || echo stale)"
check "create_pif: says it is refetching" "yes" \
  "$(grep -q 're-downloading' <<<"$out" && echo yes || echo no)"

# Without a url there is nothing to refetch, so it fails rather than looping.
cp "$tmp/truncated.chain.gz" "$tmp/nourl.chain.gz"
check "create_pif: no url still fails on a corrupt chain" "1" \
  "$( (create_pif "$tmp/nourl.chain.gz" "$tmp/nourl.pif.gz") >/dev/null 2>&1; echo $?)"
# A rebuild that dies part-way must not leave the old stamp vouching for it.
touch "$tmp/cached.pif.gz" "$tmp/cached.pif.gz.csi"
write_pif_stamp "$tmp/cached.pif.gz.cli"
JBROWSE_CLI=false
( REPROCESS=1 create_pif "$tmp/cached.chain.gz" "$tmp/cached.pif.gz") >/dev/null 2>&1
check "create_pif: a failed rebuild leaves the PIF stale" "stale" \
  "$(pif_current "$tmp/cached.pif.gz" && echo current || echo stale)"
JBROWSE_CLI=true

# copy_pif_files replaces both files and leaves no temp names behind.
mkdir "$tmp/dest"
echo new >"$tmp/p.pif.gz"
echo newidx >"$tmp/p.pif.gz.csi"
echo old >"$tmp/dest/p.pif.gz"
echo oldidx >"$tmp/dest/p.pif.gz.csi"
copy_pif_files "$tmp/p.pif.gz" "$tmp/dest"
check "copy_pif_files: replaces the PIF and its index" "new newidx" \
  "$(cat "$tmp/dest/p.pif.gz" "$tmp/dest/p.pif.gz.csi" | tr '\n' ' ' | sed 's/ $//')"
check "copy_pif_files: leaves no temp files" "p.pif.gz p.pif.gz.csi" \
  "$(find "$tmp/dest" -mindepth 1 -printf "%f\n" | sort | paste -sd " ")"

unset -f chain2paf download_file
rm -r "$tmp"

[[ $fail -eq 0 ]] && echo "All tests passed" || echo "Some tests failed"
exit $fail
