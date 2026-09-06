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

# CLI stamps: a PIF or a liftOver dir built by another make-pif is rebuilt. The
# version is stubbed so the suite does not need node_modules.
jbrowse_cli_version() { echo "@jbrowse/cli version 5.0.0-test"; }
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

# create_pif repairs the corrupt cached copy rather than failing every run.
# The download and make-pif are stubbed; the refetch is what is under test.
chain2paf() { cat >/dev/null; }
download_file() { cp "$tmp/good.chain.gz" "$2"; }
JBROWSE_CLI=true
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
unset -f chain2paf download_file
rm -r "$tmp"

[[ $fail -eq 0 ]] && echo "All tests passed" || echo "Some tests failed"
exit $fail
