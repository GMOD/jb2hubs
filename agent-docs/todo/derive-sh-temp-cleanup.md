---
name: derive-sh-temp-cleanup
description:
  write_indexed_gz_from leaves its .tmp file behind when the producer fails
  under set -e, and write_indexed_gz has no caller left. Both wait for the next
  deliberate change to lib/derive.sh, since any edit there re-derives every UCSC
  track file.
metadata:
  category: ready
  area: lib
  first_move:
    'Ride along with the next lib/derive.sh change; do not start a re-derivation
    for it alone.'
  order: 3
---

# derive.sh: temp cleanup under errexit, and a dead helper

`lib/derive.sh` is in `DERIVATION_SOURCES`, so editing it re-derives every UCSC
track file, about an hour of CPU. Neither item below is worth that alone, so fix
both in the next commit that edits it.

## The temp file a failed producer leaves

Every caller of `write_indexed_gz_from` runs under `set -euo pipefail`: the BED,
rmsk and gene track scripts, `downloadNcbiGff.sh` and `downloadGencode.sh`.
There a failing producer exits the shell at the `"$@" | bgzip` line, before the
`PIPESTATUS` check and its `rm -f "$tmp"`, so `.tmp.<out>.gz` stays on disk. The
failure installs nothing partial and the syncs exclude `.tmp.*`, so the cost is
a stray file until the next call clears it.

- Replace the pipe and the `PIPESTATUS` check with
  `if ! (set -o pipefail; "$@" | bgzip -@4 >"$tmp"); then rm -f "$tmp" "$tmp.csi"; return 1; fi`.
- Test it the way `lib/chainpif.test.sh` tests `process_chain_urls`: inside
  `bash -c 'set -euo pipefail; …'`, with a failing producer, assert no `.tmp.*`
  file is left. `lib/common.test.sh` runs without errexit, which is why the
  current tests pass.

## write_indexed_gz

No production caller remains; only `lib/common.test.sh` uses it. Delete it, fold
`install_indexed_gz` into `write_indexed_gz_from`, and move its hard-link and
tabix-refusal cases onto `write_indexed_gz_from printf …`.
