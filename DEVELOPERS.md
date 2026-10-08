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

A change to bed2gff or `src/geneLike.ts` moves `DERIVATION_HASH`, so the next
`make.sh` re-derives every gene track on its own (`./make.sh --explain` says so
first).

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

### CORS

Every genomes.jbrowse.org response says `Access-Control-Allow-Origin: *` and
exposes `Accept-Ranges`, `Content-Range`, `Content-Encoding` and
`Content-Length`, as jbrowse.org's S3 CORS does. Other pages can therefore read
the site: BandageJS searches `searchIndex.json` for genomes by name, and a
browser can range-read any file here.

CloudFront sets these headers, not nginx. The response headers policy
`genomes-jbrowse-org-cors` (`4fbb760c-f309-4dcb-914a-68451362488d`) is on the
default cache behavior of distribution `E12EBG02P68TDO`; it was added on
2026-09-27. It applies to cached objects too, so changing it needs no
invalidation. The behavior allows only GET and HEAD, so a preflighted request
isn't served. A plain fetch or a single-range read needs no preflight.

The response-headers-policy commands need an AWS CLI newer than 2.0.4, e.g.
`uvx --from awscli aws cloudfront get-response-headers-policy --id 4fbb760c-f309-4dcb-914a-68451362488d`.

`.astro` frontmatter is **not** typechecked (`astro check` was dropped with the
move to TypeScript 7), so anything type-sensitive belongs in a `.ts`/`.tsx`
module the page imports. See agent-docs/reference/TOOLCHAIN.md for the full
toolchain notes.

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

## Origin server

genomes.jbrowse.org and staging.genomes.jbrowse.org are one nginx on one EC2
instance, `i-053fb9f6fd0a37794` in us-east-1: a t2.nano (512 MB) on Ubuntu
24.04, serving static files and nothing else. Its configuration is in
`website/server/`, and `provision.sh` there applies all of it:

```bash
scp -r website/server myserver:/tmp/server
ssh myserver 'sudo bash /tmp/server/provision.sh'
```

`myserver` is the SSH alias `deploy.sh` uses. The instance's key pair is
`colin_dev_2020`:

```
Host myserver
  HostName ec2-44-223-63-202.compute-1.amazonaws.com
  User ubuntu
  IdentityFile ~/.ssh/colin_dev_2020.pem
```

### What is on it

- **`nginx-site.conf`** is the one server block. Its `root` is the variable
  `$web_root`, and `try_files` returns a plain 404 for a missing path.
- **`nginx-staging-map.conf`** sets `$web_root` from the `X-Site` request
  header: `/var/www/staging` when it says `staging`, `/var/www/html` otherwise.
  The staging CloudFront distribution (`E3IPPUV528KQIX`) adds that header on its
  way to the origin, which is how two sites share one server block.
- **The custom 404 page comes from CloudFront**, not nginx. Both distributions
  map an origin 404 to `/404.html`, which `src/pages/404.astro` builds.
- **`grub-kho-off.cfg`** adds `kho=off` to the kernel command line.
- **A 1 GB `/swapfile`**, listed in `/etc/fstab`.

### Why `kho=off`

Kernel 7.0 enables kexec handover by default, and kexec handover reserves
scratch memory at every boot. On this instance the reservation is 354 MB of 512,
and it returns to the allocator as CMA pages that the kernel's own allocations
cannot use. The first boot on 7.0, on 2026-10-06, ran the out-of-memory killer
80 times in a day and stopped answering on 2026-10-07 at 08:47 UTC, with over
200 MB reported free. The boot log shows the difference:

```
6.17   Memory: 432388K/523892K available (... 84932K reserved ...)
7.0    Memory:  72704K/523892K available (... 443548K reserved ...)
7.0 with kho=off
       Memory: 426684K/523892K available (... 89244K reserved ...)
```

The drop-in lives in `/etc/default/grub.d/`, so a kernel upgrade keeps it.

### When the site stops answering

The home page keeps loading from CloudFront's cache while every other path waits
30 seconds and returns 504, so check a path nobody has cached:

```bash
curl -sI https://genomes.jbrowse.org/robots.txt | head -1
aws --region us-east-1 ec2 describe-instance-status --instance-ids i-053fb9f6fd0a37794
```

A failed `reachability` check with the instance still `running` is the hang
above. `aws ec2 reboot-instances` brings it back in about 30 seconds, and then:

```bash
ssh myserver 'cat /proc/cmdline; grep -E "MemAvailable|CmaFree" /proc/meminfo'
ssh myserver 'sudo journalctl -b -1 -k -g "Killed process" | tail'
```

`CmaFree` above zero means `kho=off` is gone from the command line.

### The alarm that reboots it

The CloudWatch alarm `genomes-origin-reboot-on-failed-status-check` watches the
instance's own status check, and after five failed minutes in a row it runs the
EC2 reboot action. Five minutes is longer than a boot takes, so a reboot does
not trigger another. The alarm lives in AWS, not on the instance, so a rebuilt
instance needs it made again under the new instance id:

```bash
aws --region us-east-1 cloudwatch put-metric-alarm \
  --alarm-name genomes-origin-reboot-on-failed-status-check \
  --namespace AWS/EC2 --metric-name StatusCheckFailed_Instance \
  --dimensions Name=InstanceId,Value=i-053fb9f6fd0a37794 \
  --statistic Maximum --period 60 --evaluation-periods 5 --datapoints-to-alarm 5 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:automate:us-east-1:ec2:reboot
```

**Reboot the instance; do not stop and start it.** It has no Elastic IP, and
both distributions name the origin by its public DNS name, which a stop and
start replaces.

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
