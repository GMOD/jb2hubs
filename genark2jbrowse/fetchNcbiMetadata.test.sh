#!/bin/bash
#
# fetchNcbiMetadata.test.sh
#
# Tests fetchNcbiMetadata.sh against a stub datasets CLI. No network.
# Run: ./fetchNcbiMetadata.test.sh
#

set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"

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

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/hubs/a" "$tmp/hubs/b"

# The queue is two hubs; buildNcbiQueue.ts is stubbed to print it.
printf '#!/bin/bash\n' >"$tmp/bin/fd"
printf '#!/bin/bash\nprintf "hubs/a|GCF_1.1|a\\nhubs/b|GCF_2.1|b\\n"\n' >"$tmp/bin/node"
printf '#!/bin/bash\n' >"$tmp/bin/sleep"
# Answers per $STUB: "down" fails every request, "partial" knows only GCF_1.1.
cat >"$tmp/bin/datasets" <<'STUB'
#!/bin/bash
[ "$STUB" = down ] && exit 1
echo '{"reports":[{"accession":"GCF_1.1"}],"total_count":1}'
STUB
chmod +x "$tmp/bin/"*

run() {
  (cd "$tmp" && STUB=$1 PATH="$tmp/bin:$PATH" "$here/fetchNcbiMetadata.sh" >/dev/null 2>&1)
}

run down
check "an unanswered batch exits cleanly" 0 "$?"
check "an unanswered batch marks nothing not found" 0 \
  "$(find "$tmp/hubs" -name '*.notfound' | wc -l)"

run partial
check "an answered accession gets ncbi.json" GCF_1.1 \
  "$(jq -r '.reports[0].accession' "$tmp/hubs/a/ncbi.json")"
check "an accession an answered batch lacks is marked not found" yes \
  "$([ -f "$tmp/hubs/b/ncbi.json.notfound" ] && echo yes)"

exit "$fail"
