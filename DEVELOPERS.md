## Pre-requisites

- Custom fork of bed2gff https://github.com/cmdcolin/bed2gff/ (clone, cargo
  build, copy to ~/bed2gff)
- hck
- fdfind aka fd
- node.js, yarn, and npm install -g @jbrowse/cli
- rclone
- ncbi "datasets" cli

## Do everything

```bash
./run.sh           # Full pipeline: build + upload + deploy (default)
./run.sh --dry-run # Build only, no upload or deploy
```

## Preparing GenArk hubs

```bash
cd genark2jbrowse
yarn
./make.sh              # Process only new hubs (default, fastest)
./make.sh --all        # Process all hubs
./make.sh --reprocess-all  # Re-download and reprocess everything
# optionally review git diff
./uploadAll.sh
```

## Preparing UCSC hubs

```bash
cd ucsc2jbrowse
yarn
./make.sh                  # Download + process (default)
./make.sh --skip-download  # Skip download, just process existing data
./make.sh --reprocess-all  # Force reprocess everything
# optionally review git diff
./uploadAll.sh
```

## Deploy website

```bash
cd website
yarn
yarn deploy
```

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

## What is in this repo

- Scripts that ingest the UCSC goldenPath database dumps, and converts them into
  jbrowse configs (the ucsc2jbrowse folder)
- Scripts that convert the UCSC GenArk hubs, and converts them into jbrowse
  configs (the genark2jbrowse folder)
- Astro-based website for statically generating lots of pages (the website
  folder)

## Note

This repo was written with the aid of AI tools including Claude and avante.nvim

A huge thank you to UCSC team for their generous data sharing policy and work on
these resources

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
