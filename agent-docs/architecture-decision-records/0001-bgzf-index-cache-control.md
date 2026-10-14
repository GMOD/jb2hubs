# ADR 0001 — Serve tabix/CSI index files with `Cache-Control: no-cache`

- **Status:** Accepted
- **Date:** 2026-06-03
- **Affected:** `lib/common.sh`, `genark2jbrowse/uploadAll.sh`,
  `ucsc2jbrowse/uploadAll.sh`, the `jbrowse.org` S3 bucket, the CloudFront
  distribution (`E13LGELJOT4GQO`)

## Context

A tabix/bgzip track is **two coupled objects**: the bgzipped data (`*.gff.gz`,
`*.bed.gz`) and its index (`*.csi` here; `*.tbi` for tabix). The index stores
byte (virtual) offsets into the `.gz`. When the pipeline regenerates a track,
both files change, and the new index's offsets are valid only against the new
data.

After a run that regenerated gene tracks, clients reported **"invalid bgzf
header"** on GFF tracks. A client had paired a stale cached index with freshly
regenerated data (or the reverse), so an offset fell mid-bgzf-block instead of
on a block boundary.

Two cache layers let the mismatched pair through our existing safeguards:

1. **CloudFront edge cache.** We already invalidate `/hubs/*` and `/ucsc/*`
   after every changed upload, and the `run.sh` logs show the invalidation
   firing, so this layer was covered.
2. **The browser's HTTP cache.** `create-invalidation` does not touch it. The
   data and index objects were uploaded with no `Cache-Control` header
   (`CacheControl: null`), so browsers fall back to heuristic freshness off
   `Last-Modified` and reuse a cached index from disk without revalidating. A
   client that loaded a track before an update keeps its old index and pairs it
   with the new data.

A smaller window remains: `rclone sync` ships objects over several minutes and
does not update the `.gz`/index pair atomically, so a client loading mid-deploy
can fetch a mismatched pair before the invalidation runs.

The bug is rare, because these files seldom change, and serious, because to a
user it looks like data corruption.

## Decision

Upload index files only (`*.csi`, `*.tbi`) with **`Cache-Control: no-cache`**.
The header tells the browser to store the object but revalidate it with the
origin (via ETag / `If-None-Match`) before each reuse; it does not disable
caching. The origin answers a `304 Not Modified` when the index is unchanged and
sends the new bytes when it changed, so the browser's index always matches the
one on S3.

### Why the header goes on the index and not the data

- The browser fetches the `.csi`/`.tbi` with a full `GET` (200) and caches the
  response reliably and for a long time, so the index is the object that goes
  stale across updates. Revalidating it is cheap, since the browser fetches it
  once per track load.
- The browser fetches the `.gz` with range requests (206), which it caches far
  less aggressively, so stale data tends to be re-fetched from CloudFront, which
  we invalidate. `no-cache` on the large `.gz` would add a conditional round
  trip to every range request while browsing, slowing interaction for little
  correctness gain.

The fix leaves one case open: a browser that also cached `.gz` range responses
could still pair a fresh index with stale data. It targets the common failure at
almost no cost. Closing every case would need immutable, content-hashed URLs for
the pair, a much larger change to how JBrowse configs reference files, which we
judged not worth it.

### Implementation

`rclone_sync_with_indexes` (`lib/common.sh`), which both `uploadAll.sh` scripts
call, splits the rclone sync into two passes:

1. **Main pass:** `--exclude "*.csi" --exclude "*.tbi"`. rclone applies filters
   to both source and destination, so this pass does not delete excluded index
   objects on S3 (checked locally).
2. **Index pass:**
   `--include "*.csi" --include "*.tbi" --header-upload "Cache-Control: no-cache"`.
   It uploads new and changed indexes with the header and still deletes orphaned
   ones (checked locally).

The function sums the change counts from both passes, so an index-only change
still triggers the CloudFront invalidation and writes `.upload-changed`.

### One-time retrofit

rclone `-c` compares by checksum and skips unchanged files, so the header
reaches an index only when its content changes. These files change so rarely
that most indexes would have stayed without the header for a long time, which is
where the bug occurs. We therefore ran a one-time server-side retrofit on
2026-06-03:

```bash
for prefix in hubs/genark ucsc; do
  aws s3 cp "s3://jbrowse.org/$prefix/" "s3://jbrowse.org/$prefix/" \
    --recursive --exclude "*" --include "*.csi" --include "*.tbi" \
    --metadata-directive REPLACE \
    --cache-control no-cache \
    --content-type application/octet-stream \
    --storage-class INTELLIGENT_TIERING
done
```

`--storage-class INTELLIGENT_TIERING` is **required**: without it the copies
drop to `STANDARD` with no warning. A
`cloudfront_invalidate "/hubs/*" "/ucsc/*"` followed the copy.

## Consequences

- A regenerated track can no longer serve a stale index against new data,
  because the browser revalidates the index on every track load.
- Each track load costs one extra conditional request per index (`304` when
  unchanged), which is negligible and stays off the data range requests.
- Each upload now runs two rclone passes (two directory walks). The hasher
  backend keeps listing and hashing cheap, so the added time is small.
- Data `.gz` files still have no `Cache-Control`; their freshness still depends
  on CloudFront invalidation plus browser heuristics. That is acceptable because
  the index is the half of the pair browsers cache reliably.
- The non-atomic deploy window remains, since S3 has no atomic multi-object
  swap; the CloudFront invalidation after upload limits it.
