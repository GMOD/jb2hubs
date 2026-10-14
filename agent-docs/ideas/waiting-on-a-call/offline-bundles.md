---
name: offline-bundles
description:
  'Per-assembly zip bundles a Desktop user opens offline: Lambda-built,
  user-chosen track pack, size-capped. Design only; nothing built.'
---

# Offline bundles for JBrowse Desktop

## Goal

A user downloads a self-contained bundle for one assembly and opens it in
JBrowse Desktop **offline**, with no terminal and no config editing. The
audience includes users with little technical experience, so the common path is
click → get a `.zip` → unzip → double-click the `.jbrowse` file.

## Data volume

Every track in our configs points at a **remote** range-query file on
`hgdownload.soe.ucsc.edu` (2bit / bigBed / bigWig). Offline use needs those
bytes on disk and a config rewritten to local paths, and the volume decides what
a bundle can hold:

- GenArk assembly hubs are small (~10–20 tracks).
- Full **UCSC browser hubs** (`/ucsc/{db}/config.json`, e.g. hg38) have hundreds
  of tracks and multi-GB ENCODE bigWigs, too much to bundle and more than anyone
  wants offline.

A bundle therefore holds the reference plus a **minimal, user-chosen pack** of
tracks.

## Decision summary

| Question                         | Decision                                                |
| -------------------------------- | ------------------------------------------------------- |
| Delivery                         | AWS Lambda builds a `.zip`, returns a presigned S3 URL  |
| Track selection                  | Checkbox picker, default-visible tracks pre-checked     |
| Size control                     | Sum `Content-Length` via HEAD; warn/cap before building |
| Reference                        | Always included (2bit + chrom.sizes + chromAlias)       |
| Local script (`.sh`) alternative | Dropped for now; revisit for power users                |

## The `.jbrowse` file

The `.jbrowse` file is a JBrowse Desktop config with the same structure as our
`config.json`, except that the Lambda rewrites every adapter file location from
an absolute `hgdownload` URL to a **relative path** under the unzip directory:

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

The rewrite localizes only adapter subtrees (`assembly.sequence.adapter`,
`assembly.refNameAliases.adapter`, `track.adapter`). It leaves track `metadata`
(doc-link HTML, `$$` URL templates) as is, so the Lambda does not try to
download documentation links.

**Open question: relative path resolution.** The design assumes JBrowse Desktop
resolves a relative adapter `uri` against the opened config file's location
(`baseUri`), which is portable. If it does not, the paths would have to be
absolute, and the Lambda cannot know where the user unzips, so the fallback is a
small launcher that rewrites the paths to absolute on first run. Check this
first, by hand-building one zip and opening it in Desktop.

## Minimal-pack selection

The configs already have UCSC `visibility`: UCSC shows tracks with
`metadata.ucsc.visibility` in `{pack, full, dense}` by default and hides `hide`
tracks. Every bundle includes the reference.

The checkbox picker, per the product decision:

- Renders the track list grouped by `category`.
- Pre-checks tracks where `visibility !== "hide"`, and shows the reference
  checked and locked.
- Shows a running **estimated size** (see below) and the total track count.
- Keeps "Download offline zip" disabled until the size is known and under the
  hard cap.

With default-visible tracks pre-checked, the common case takes one click, and
power users can still add or remove tracks.

## Size estimation and cap

Before building, the frontend (or the Lambda) sends a HEAD request for each
selected file and sums `Content-Length`:

- The estimate updates as boxes are checked, with HEAD results cached per
  session.
- A **soft warning** appears above e.g. 500 MB.
- A **hard cap** above e.g. 2 GB (configurable) blocks the build and suggests
  trimming, because of Lambda time and memory limits and how long users will
  wait for a download.

The HEADs can run client-side if `hgdownload` sends permissive CORS headers;
otherwise the Lambda exposes an `/estimate` endpoint that runs them server-side.

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

Implementation points:

- **Stream, never buffer.** A streaming zip (`yazl`/`archiver`) pipes into an S3
  multipart upload (`@aws-sdk/lib-storage` `Upload`), so memory stays flat
  whatever the bundle size. Each file goes `fetch(url).body` → zip entry → S3.
- **Store bigBed/bigWig/2bit without deflate.** They are already compressed, so
  deflating them costs CPU time and leaves the size unchanged.
- **Return a presigned URL instead of the zip.** Fetching a 1 GB hub from UCSC
  can take minutes; a presigned S3 link avoids HTTP and browser timeouts and
  lets the download resume.
- **Idempotency and caching.** Key the S3 object by a hash of
  `(configUrl, sorted trackIds)`. If the object exists and is fresh, skip the
  rebuild and return its presigned URL, which lowers cost for popular
  assemblies.
- **Lifecycle.** An S3 lifecycle rule expires bundles after N days, since any
  bundle can be rebuilt on demand.

### Lambda config

- Memory: 1–2 GB, because network throughput scales with memory and the job is
  I/O bound.
- Timeout: 15 min (the maximum). Choose the hard size cap so a worst-case bundle
  finishes well under it.
- `/tmp`: unused when streaming to S3, which also avoids its 10 GB cap.
- A concurrency limit bounds UCSC egress and AWS cost.

### Endpoints (Function URL)

- `POST /estimate { configUrl, trackIds }` → `{ sizeBytes, perTrack[] }` (needed
  only if CORS blocks client-side HEAD).
- `POST /bundle { configUrl, trackIds }` →
  `{ url, sizeBytes, trackCount, cached }`.

## Frontend changes

- A new island, `OfflineBundle.tsx`, on the accession page
  (`accession/[id].astro`), near "Genome browsers" / "Portals/data downloads".
- The frontmatter computes `configUrl` from existing data:
  `ucscDbName → https://jbrowse.org/ucsc/{db}/config.json`, else the `config=`
  param of `jbrowseLink` resolved against `https://jbrowse.org`.
- The component fetches the config on open, renders the grouped checkbox list
  with default-visible tracks pre-checked and a live size estimate, and its
  "Download offline zip" button POSTs to the Lambda and navigates to the
  returned presigned URL.

## Deployment

Deploy it as a third SAM stack beside `aws/config-merger/` and
`aws/ortholog-assembler/`, each a `template.yaml` defining the function, its
endpoint and its IAM.

The Lambda needs `s3:PutObject`/`CreateMultipartUpload`/`UploadPart` on the
bundle bucket, `s3:GetObject` for presigning, and outbound HTTPS to
`hgdownload.soe.ucsc.edu`.

## Cost and courtesy

- Lambda time costs little; the cost is **egress** (UCSC → Lambda → S3 → user)
  and S3 storage, which idempotency and lifecycle expiry keep bounded.
- The bundles re-serve UCSC data, so keep concurrency modest and consider a
  short cache to limit the load on `hgdownload`.

## Risks and open questions

- **Desktop relative-path resolution** (check first; see above).
- `hgdownload` CORS for the client-side HEAD size estimate.
- Trix/text-search index files (`.ix`/`.ixx`) and the 2bit `.bpt` are named in
  `metadata`, not in adapters. Decide whether to include them for search and
  speed or omit them for size.
- A very large reference (the human 2bit is ~1 GB) pushes a "minimal" bundle
  over the caps by itself, and the UI should say so plainly.

## Phased plan

- **Phase 0, validate:** hand-build one localized zip and confirm it opens
  offline in JBrowse Desktop (path semantics). Every later phase depends on it.
- **Phase 1, frontend picker:** the track-picker island, `configUrl` derivation
  and a client-side size estimate (or a stub), with no backend and "download"
  disabled.
- **Phase 2, Lambda:** streaming zip → S3 → presigned URL, the size cap,
  idempotency and lifecycle, with the button wired to it.
- **Phase 3, polish:** caching, concurrency limits, README content, error states
  and telemetry on popular bundles.
