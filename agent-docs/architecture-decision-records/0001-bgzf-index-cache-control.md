# ADR 0001 — Serve tabix/CSI index files with `Cache-Control: no-cache`

- **Status:** Accepted
- **Date:** 2026-06-03
- **Affected:** `genark2jbrowse/uploadAll.sh`, `ucsc2jbrowse/uploadAll.sh`, the
  `jbrowse.org` S3 bucket, the CloudFront distribution (`E13LGELJOT4GQO`)

## Context

A tabix/bgzip track is **two coupled objects**: the bgzipped data (`*.gff.gz`,
`*.bed.gz`) and its index (`*.csi` here; `*.tbi` for tabix). The index stores
byte (virtual) offsets into the `.gz`. When a track is regenerated, both files
change, and the new index's offsets are only valid against the new data.

Clients started reporting **"invalid bgzf header"** on GFF tracks after a run
that regenerated gene tracks. The cause is a torn pair: a client used a **stale
cached index against freshly-regenerated data** (or vice-versa), so an offset
landed mid-bgzf-block instead of on a block boundary.

The mismatch survives our existing safeguards because of two cache layers:

1. **CloudFront edge cache** — we already invalidate `/hubs/*` and `/ucsc/*`
   after every changed upload (verified firing in `run.sh` logs). This layer is
   handled.
2. **The browser's own HTTP cache** — `create-invalidation` does **nothing** to
   this. And the data/index objects were uploaded with **no `Cache-Control`
   header at all** (verified: `CacheControl: null`), so browsers fall back to
   _heuristic freshness_ off `Last-Modified` and will reuse a cached index from
   disk without revalidating. A client that loaded a track before an update
   keeps its old index and pairs it with new data → torn pair.

There is also a smaller, unavoidable window: `rclone sync` ships objects over
several minutes and the `.gz`/index pair is **not updated atomically**, so a
client loading mid-deploy can grab a mismatched pair before invalidation runs.

This bug is **rare** (these files seldom change) but **dangerous**: to a user it
looks like data corruption, not a transient cache issue.

## Decision

Upload **index files only** (`*.csi`, `*.tbi`) with
**`Cache-Control: no-cache`**. This means "store it, but you must revalidate
with the origin (via ETag / `If-None-Match`) before reusing it" — _not_ "don't
cache". The origin returns a cheap `304 Not Modified` when unchanged and fresh
bytes when changed, so the browser's index is always in lockstep with what's on
S3.

### Why index-only and not the data too

- The `.csi`/`.tbi` is fetched as a **full `GET` (200)**, which browsers cache
  reliably and long-term — this is the object that actually goes stale across
  updates. Forcing it to revalidate is cheap because it is fetched **once per
  track load**.
- The `.gz` is fetched via **range requests (206)**, whose browser caching is
  far less aggressive; stale data tends to re-fetch from CloudFront (which we
  invalidate) anyway. Putting `no-cache` on the large `.gz` would add a
  conditional round-trip to **every range request during browsing**, hurting the
  interactive experience for little correctness gain.

This is not theoretically airtight (a browser that also cached `.gz` range
responses could still pair a fresh index with stale data), but it targets the
dominant real-world failure at near-zero cost. Fully airtight would require
immutable/content-hashed URLs for the pair — a much larger change to how JBrowse
configs reference files, deemed not worth it.

### Implementation

In both `uploadAll.sh` scripts the rclone sync is split into two passes:

1. **Main pass** — `--exclude "*.csi" --exclude "*.tbi"`. rclone filters apply
   to both source and destination, so excluded index objects on S3 are **not
   deleted** by this pass (verified locally).
2. **Index pass** —
   `--include "*.csi" --include "*.tbi" --header-upload "Cache-Control: no-cache"`.
   Uploads new/changed indexes with the header and still deletes orphaned ones
   (verified locally).

Change counts from both passes are summed so an index-only change still triggers
the CloudFront invalidation and writes `.upload-changed`.

### One-time retrofit

rclone `-c` compares by checksum and skips unchanged files, so the header only
lands on an index whose **content changes**. Because these files change so
rarely, relying on gradual healing would leave most indexes header-less for a
very long time — exactly where the bug bites. A one-time server-side retrofit
was therefore run on 2026-06-03:

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

`--storage-class INTELLIGENT_TIERING` is **required** — omitting it would
silently downgrade the copies to `STANDARD`. Followed by a
`cloudfront_invalidate "/hubs/*" "/ucsc/*"`.

## Consequences

- Regenerated tracks can no longer serve a stale index against new data; the
  index revalidates on every track load.
- One extra conditional request per index per track load (`304` when unchanged)
  — negligible, and not on the data range-request hot path.
- Each upload now does **two** rclone passes (two directory walks). The hasher
  backend keeps listing/hashing cheap, so the added time is small.
- Data `.gz` files still carry no `Cache-Control`; their freshness continues to
  rely on CloudFront invalidation plus browser heuristics. Acceptable given the
  index is the reliably-cached half of the pair.
- The non-atomic deploy window remains (no atomic multi-object swap on S3);
  CloudFront invalidation after upload is the backstop.
