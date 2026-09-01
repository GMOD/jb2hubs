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

[[ $fail -eq 0 ]] && echo "All tests passed" || echo "Some tests failed"
exit $fail
