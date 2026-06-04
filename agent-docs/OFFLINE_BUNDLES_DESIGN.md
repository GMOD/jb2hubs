# Offline bundles for JBrowse Desktop — design

## Goal

Let a user download a self-contained bundle for one assembly and open it in
JBrowse Desktop **offline** — no terminal, no config editing. Target audience
includes technically inexperienced users, so the happy path is: click → get a
`.zip` → unzip → double-click the `.jbrowse` file.

## Why this is non-trivial

Every track in our configs points at a **remote** range-query file on
`hgdownload.soe.ucsc.edu` (2bit / bigBed / bigWig). Offline use requires the
actual bytes local and the config rewritten to local paths.

The blocker is **data volume**:

- GenArk assembly hubs are small (~10–20 tracks).
- Full **UCSC browser hubs** (`/ucsc/{db}/config.json`, e.g. hg38) have hundreds
  of tracks and multi-GB ENCODE bigWigs. Bundling everything is infeasible and
  pointless.

So a bundle must include only a **minimal, user-chosen pack** of tracks plus the
reference.

## Decision summary

| Question                         | Decision                                                |
| -------------------------------- | ------------------------------------------------------- |
| Delivery                         | AWS Lambda builds a `.zip`, returns a presigned S3 URL  |
| Track selection                  | Checkbox picker, default-visible tracks pre-checked     |
| Size control                     | Sum `Content-Length` via HEAD; warn/cap before building |
| Reference                        | Always included (2bit + chrom.sizes + chromAlias)       |
| Local script (`.sh`) alternative | Dropped for now; revisit as a power-user escape hatch   |

## The `.jbrowse` artifact

A JBrowse Desktop config file. Same shape as our `config.json`, but every
adapter file location is rewritten from an absolute `hgdownload` URL to a
**relative path** under the unzip dir, e.g.

```
https://hgdownload.soe.ucsc.edu/hubs/GCA/000/950/515/GCA_000950515.2/.../foo.bb
→ data/hgdownload.soe.ucsc.edu/hubs/GCA/000/950/515/GCA_000950515.2/.../foo.bb
```

Zip layout:

```
GCA_000950515.2-offline.zip
├── GCA_000950515.2.jbrowse      # localized config
├── README.txt                   # "unzip, open the .jbrowse in JBrowse Desktop"
└── data/
    └── hgdownload.soe.ucsc.edu/hubs/GCA/.../*.{2bit,bb,bw,txt}
```

Rewrite rule: only adapter subtrees are localized (`assembly.sequence.adapter`,
`assembly.refNameAliases.adapter`, `track.adapter`). Track `metadata` (doc-link
HTML, `$$` URL templates) is left untouched so we don't try to download
documentation links.

**Open question — relative path resolution.** Confirm JBrowse Desktop resolves
relative adapter `uri` against the opened config file's location (`baseUri`). If
not, the Lambda should emit `localPath` instead, computed at unzip time isn't
possible (we don't know the user's path), so we'd need either:

- relative `uri` + verified `baseUri` behavior (preferred, portable), or
- a tiny launcher that rewrites paths to absolute on first run. This is the
  single most important thing to validate first (cheap: hand-build one zip and
  open it in Desktop).

## Minimal-pack selection

Signal already in configs: UCSC `visibility`. Tracks with
`metadata.ucsc.visibility` in `{pack, full, dense}` are shown by default; `hide`
are hidden. The reference is always required.

UI (checkbox picker, per the product decision):

- Render the track list grouped by `category`.
- Pre-check tracks where `visibility !== "hide"`; reference is checked and
  locked.
- Show a running **estimated size** (see below) and total track count.
- "Download offline zip" disabled until size is known and under the hard cap.

Pre-checking default-visible keeps the common case one click while letting power
users add/remove.

## Size estimation & cap

Before building, the frontend (or Lambda) issues HEAD requests for each selected
file and sums `Content-Length`:

- Show estimate live as boxes are checked (cache HEADs per session).
- **Soft warn** above e.g. 500 MB.
- **Hard cap** above e.g. 2 GB (configurable) — block and suggest trimming.
  Rationale: Lambda time/memory limits and user download patience.

HEADs can run client-side if `hgdownload` sends permissive CORS; otherwise the
Lambda exposes a `/estimate` endpoint that does them server-side.

## Architecture

```
Browser (accession page)
  │  1. fetch config.json, render track picker
  │  2. POST /bundle { configUrl, trackIds }
  ▼
Lambda (Function URL)
  │  3. fetch config.json, validate trackIds, HEAD sizes, enforce cap
  │  4. stream each selected file: hgdownload → zip entry → S3 multipart upload
  │  5. add localized .jbrowse + README to the zip
  │  6. finalize S3 object, create presigned GET URL (e.g. 24h)
  ▼
Returns { url, sizeBytes, trackCount }
Browser redirects/links to the presigned URL → user downloads the zip
```

Key implementation points:

- **Stream, never buffer.** Use a streaming zip (`yazl`/`archiver`) piped into
  an S3 multipart upload (`@aws-sdk/lib-storage` `Upload`). Memory stays flat
  regardless of bundle size. Per-file: `fetch(url).body` → zip entry → S3.
- **No compression for bigBed/bigWig/2bit** (already compressed binary) — store,
  don't deflate. Saves CPU/time; size is unchanged anyway.
- **Presigned URL, not direct response.** A 1 GB hub fetched from UCSC can take
  minutes; returning a presigned S3 link avoids HTTP/browser timeouts and lets
  the download resume.
- **Idempotency / caching.** Key the S3 object by a hash of
  `(configUrl, sorted trackIds)`. If it exists and is fresh, skip rebuild and
  return its presigned URL. Cuts cost for popular assemblies.
- **Lifecycle.** S3 lifecycle rule expires bundles after N days; they're
  reproducible on demand.

### Lambda config

- Memory: 1–2 GB (network throughput scales with memory; we're I/O bound).
- Timeout: 15 min (max). The hard size cap must be chosen so a worst-case bundle
  finishes well under this.
- `/tmp`: not needed if we stream to S3 (avoid the 10 GB cap entirely).
- Concurrency limit to bound UCSC egress and AWS cost.

### Endpoints (Function URL)

- `POST /estimate { configUrl, trackIds }` → `{ sizeBytes, perTrack[] }`
  (optional; only if client-side HEAD is blocked by CORS).
- `POST /bundle { configUrl, trackIds }` →
  `{ url, sizeBytes, trackCount, cached }`.

## Frontend changes

- New island `OfflineBundle.tsx` on the accession page (`accession/[id].astro`),
  near "Genome browsers" / "Portals/data downloads".
- Compute `configUrl` in frontmatter from existing data:
  `ucscDbName → https://jbrowse.org/ucsc/{db}/config.json`, else the `config=`
  param of `jbrowseLink` resolved against `https://jbrowse.org`.
- Component: fetch config on open, render grouped checkbox list with
  default-visible pre-checked, live size estimate, "Download offline zip" that
  POSTs to the Lambda and navigates to the returned presigned URL.

## Deployment

Repo currently ships static data to S3 + CloudFront via `rclone` (see
`ucsc2jbrowse/uploadAll.sh`); there is **no existing Lambda infra**. Options:

- **AWS CDK or SST** (TypeScript, fits the repo) — define Lambda + Function URL
  - S3 bucket + IAM + lifecycle in code. Preferred for reproducibility.
- **Plain handler + manual deploy** — fastest to prototype, weakest to maintain.

IAM: Lambda needs `s3:PutObject`/`CreateMultipartUpload`/`UploadPart` on the
bundle bucket and `s3:GetObject` for presigning. Outbound HTTPS to
`hgdownload.soe.ucsc.edu`.

## Cost & courtesy

- Lambda is cheap; the real cost is **egress** (UCSC → Lambda → S3 → user) and
  S3 storage. Idempotency + lifecycle expiry keep both bounded.
- We re-serve UCSC data — keep concurrency modest and consider a short cache so
  we're not hammering `hgdownload`.

## Risks / open questions

- **Desktop relative-path resolution** (validate first, see above).
- `hgdownload` CORS for client-side HEAD/size estimate.
- Trix/text-search index files (`.ix`/`.ixx`) and 2bit `.bpt` are referenced in
  `metadata`, not adapters — decide whether to include for search/speed or omit
  for size.
- Very large references (human 2bit ~1 GB) push a "minimal" bundle over caps on
  their own — surface this clearly in the UI.

## Phased plan

- **Phase 0 — validate**: hand-build one localized zip, confirm it opens offline
  in JBrowse Desktop (path semantics). Gates everything else.
- **Phase 1 — frontend picker**: track-picker island + `configUrl` derivation +
  client-side size estimate (or stubbed). No backend; "download" disabled.
- **Phase 2 — Lambda**: streaming zip → S3 → presigned URL, size cap,
  idempotency, lifecycle. Wire the button to it.
- **Phase 3 — polish**: caching, concurrency limits, README content, error
  states, telemetry on popular bundles.

```

```
