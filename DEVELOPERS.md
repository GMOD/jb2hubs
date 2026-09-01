# Developing jb2hubs

What the repo contains and how the pieces fit together is in
[README.md](README.md); the invariants worth reading before changing a pipeline
are in [CLAUDE.md](CLAUDE.md). This file is how to run things.

## Pre-requisites

- node.js and [pnpm](https://pnpm.io) — `pnpm install` at the repo root installs
  every workspace (`website`, `ucsc2jbrowse`, `genark2jbrowse`, `hubtools`,
  `aws/*`)
- `npm install -g @jbrowse/cli`
- Rust toolchain (cargo) — to build the vendored `bed2gff` (see below)
- hck
- fdfind aka fd
- rclone
- ncbi `datasets` cli
- xxhash (`xxhsum`, the incremental gates' hashing) and pigz (parallel gzip in
  the GFF/BED/chain steps) — also needed by the shell tests

### Build bed2gff

Our fork of bed2gff is vendored at [`bed2gff/`](bed2gff/) (see
[bed2gff/VENDORED.md](bed2gff/VENDORED.md)). Build it once before running the
UCSC pipeline:

```bash
pnpm build:bed2gff   # -> bed2gff/target/release/bed2gff
```

`ucsc2jbrowse/createGeneTracksForGoldenPath.sh` resolves that binary
automatically and fails fast with a build hint if it's missing.

## Do everything

```bash
./run.sh                 # Full pipeline: build + upload + deploy (default, incremental)
./run.sh --dry-run       # Build only, no upload or deploy
./run.sh --upload-only   # Upload + deploy only, skip build (run after --dry-run)
./run.sh --all           # Build every assembly/hub, not just new/changed ones
./run.sh --reprocess-all # Re-derive every config from cached downloads
./run.sh --staging       # Build + deploy website to staging only (no S3 upload / git push)
```

`--all`, `--reprocess-all` and `--help` mean the same thing in all three entry
points (`run.sh` and both `make.sh`) and are parsed by one `parse_flags` helper
in `lib/common.sh`; `run.sh` forwards them to both pipelines. Each script adds
its own flags on top (`--dry-run`/`--upload-only`/`--staging` for `run.sh`,
`--skip-download` for `ucsc2jbrowse`).

To rebuild one pipeline only, run its `make.sh` directly and then ship:

```bash
./ucsc2jbrowse/make.sh && ./run.sh --upload-only
```

Two env vars force work past the incremental gates (canonical description in
`lib/common.sh`; they compose):

```bash
REPROCESS=1 ./run.sh      # re-derive outputs from cached downloads (implied by --reprocess-all)
FETCH_UPDATES=1 ./run.sh  # re-pull upstream NCBI GFFs in both pipelines
```

## Preparing GenArk hubs

```bash
cd genark2jbrowse
./make.sh                  # Visit every hub, rebuild what is stale
./make.sh --reprocess-all  # Re-derive everything from cached downloads
# optionally review git diff
./uploadAll.sh
```

## Preparing UCSC hubs

```bash
cd ucsc2jbrowse
./make.sh                  # Download, then process assemblies whose trackDb changed
./make.sh --all            # Process every assembly, not just changed ones
./make.sh --skip-download  # Skip the rsync, process what's on disk (implies --all)
./make.sh --reprocess-all  # Re-derive everything from cached downloads
# optionally review git diff
./uploadAll.sh
```

After changing bed2gff or `src/geneLike.ts`, the incremental gates won't notice
(they key off input-data hashes, not tool versions). Regenerate just the gene
tracks for every assembly, then upload:

```bash
cd ucsc2jbrowse
./reprocessGeneTracks.sh   # add --reindex to also rebuild the text index
./uploadAll.sh
```

## Website

```bash
cd website
pnpm run dev          # local dev server (predev pulls processedHubJson from S3)
pnpm run build        # static build into dist/
pnpm run deploy       # build, publish to the server, invalidate CloudFront
pnpm run rollback     # point the webroot back at the previous release
```

Use `pnpm run deploy`, not `pnpm deploy` — the latter is pnpm's own built-in
command.

### How the publish works

`website/deploy.sh` unpacks the build into a fresh timestamped directory under
`/var/www/releases/<production|staging>/`, verifies it, and only then moves the
`/var/www/html` symlink onto it with `mv -T` (one `rename(2)`, atomic). Nothing
is deleted until the new release is serving traffic, so a failed or truncated
transfer leaves the live site exactly as it was, and any request is served
entirely by one release or entirely by the other.

`--rollback` re-points the symlink at the previous release, which is why
`KEEP_RELEASES=2` — the tree is 5.4GB, and old releases are pruned _before_ the
next transfer so a deploy never needs three on disk at once.

The webroots are symlinks and `/var/www` is owned by `ubuntu`; both were set up
on 2026-08-26 and the script re-does the migration by itself against a webroot
that is still a real directory. nginx sets no `disable_symlinks`, so it follows
them and resolves the path per request — the swap takes effect immediately.

`.astro` frontmatter is **not** typechecked (`astro check` was dropped with the
move to TypeScript 7), so anything type-sensitive belongs in a `.ts`/`.tsx`
module the page imports. See CLAUDE.md for the full toolchain notes.

## Checks

```bash
pnpm lint:fast            # oxlint, syntactic
pnpm lint                 # oxlint --type-aware (tsgolint)
pnpm typecheck            # astro sync + tsc --noEmit
pnpm check-format         # oxfmt + prettier for *.astro   (pnpm format to fix)
pnpm lint:sh              # shellcheck        (pnpm format:sh to fix with shfmt)
pnpm --recursive run test # vitest / node:test suites
./lib/common.test.sh      # shell unit tests
./lib/chainpif.test.sh
```

Before publishing regenerated configs:

```bash
pnpm check-plugin-urls                 # plugins[].url reachability — seconds, no browser
pnpm check-config-compat --local       # boot the working-tree configs in every hosted release
```

`run.sh` runs both gates for you before either `uploadAll.sh`;
`SKIP_CONFIG_GATE=1` overrides.

## Nginx configuration

The website includes a custom 404 page (`src/pages/404.astro`) that gets built
to `dist/404.html`. To enable it in nginx, add the following to your server
block:

```nginx
server {
    # ... existing config ...

    root /var/www/html;

    error_page 404 /404.html;

    location = /404.html {
        internal;
    }
}
```

The `internal` directive ensures the 404 page can only be accessed via internal
redirects (not directly by URL).

## Why Astro

We started with Next.js, but it was slow and did not have reproducible builds,
making bulk export to AWS S3 slow and even costly (uploading thousands of files)

## Rclone config

This is in ~/.config/rclone/rclone.conf

```
[jbrowse-data]
type = s3
provider = AWS
env_auth = true
region = us-east-1
acl = public-read
storage_class = STANDARD_IA

[jbrowse-data-hashed]
type = hasher
remote = jbrowse-data:

[ucsc-results-hashed]
type = hasher
remote = /home/cdiesh/ucscResults
hashes = md5
max_age = off

[genark-hubs-hashed]
type = hasher
remote = /home/cdiesh/src/jb2hubs/genark2jbrowse/hubs
hashes = md5
max_age = off

[website-hashed]
type = hasher
remote = /home/cdiesh/src/jb2hubs/website/dist
hashes = md5
max_age = off
```

### About the hasher backend

The `ucsc-results-hashed`, `genark-hubs-hashed`, and `website-hashed` remotes
use rclone's [hasher backend](https://rclone.org/hasher/) to cache MD5
computations for local files. This dramatically speeds up syncing large .pif.gz
files.

**How it works:**

- First sync: rclone computes MD5 for all files and caches them in
  `~/.cache/rclone/kv/`
- Subsequent syncs: rclone uses cached MD5s (instant!) instead of rehashing
- When files change: rclone detects mtime/size changes and recalculates
  automatically
- Comparison: Cached local MD5 vs S3 ETag (both fast!)

**Why `max_age = off`:**

- Hash cache persists indefinitely (unless files are modified)
- Avoids slow rehashing of large pif.gz files on every sync
- Safe because files are generated programmatically with correct mtimes
- Cache stored in `~/.cache/rclone/kv/BaseRemote~hasher.bolt`

**Note:** Update the paths in `ucsc-results-hashed`, `genark-hubs-hashed`, and
`website-hashed` to match your local environment.
