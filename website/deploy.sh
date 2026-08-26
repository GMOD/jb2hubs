#!/bin/bash
#
# website/deploy.sh
#
# Publish website/dist to the EC2 origin without taking the site down.
#
# The old one-liner was
#
#   tar -czf - -C dist . | ssh myserver 'rm -rf /var/www/html/* && tar -xzf - -C /var/www/html'
#
# which deletes the live site and then spends ~4 minutes unpacking 129k files
# into the hole it just made. That is not a failure mode, it is every deploy:
# genomes.jbrowse.org 404s for the whole window, and CloudFront caches those
# 404s past the end of it. If the stream dies partway the site simply stays
# broken, and a *local* tar failure is invisible to the shell (a pipeline's exit
# status is its last command, so ssh returning 0 on a truncated archive still
# triggers the invalidation).
#
# Instead: unpack into a fresh release directory, verify it, and then move the
# webroot symlink onto it. rename(2) is atomic, so a request is served either
# entirely by the old release or entirely by the new one. Nothing is deleted
# until a new release is serving traffic, which also makes rollback a symlink.

set -euo pipefail

SSH_HOST=myserver
RELEASES_ROOT=/var/www/releases
KEEP_RELEASES=2

target=production
webroot=/var/www/html
distribution=E12EBG02P68TDO
rollback=0

while [[ $# -gt 0 ]]; do
  case "$1" in
  --staging)
    target=staging
    webroot=/var/www/staging
    distribution=E3IPPUV528KQIX
    ;;
  --rollback) rollback=1 ;;
  -h | --help)
    echo "usage: $0 [--staging] [--rollback]"
    exit 0
    ;;
  *)
    echo "unknown argument: $1" >&2
    exit 2
    ;;
  esac
  shift
done

cd "$(dirname "$0")"

invalidate() {
  echo "==> invalidating CloudFront $distribution"
  aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*' >/dev/null
}

if [[ $rollback -eq 1 ]]; then
  echo "==> rolling back $target"
  ssh "$SSH_HOST" bash -s -- "$RELEASES_ROOT/$target" "$webroot" <<'REMOTE'
set -euo pipefail
releases_dir=$1
webroot=$2

current=$(readlink -f "$webroot")
previous=$(find "$releases_dir" -mindepth 1 -maxdepth 1 -type d | sort | awk -v cur="$current" '$0 != cur' | tail -1)

if [[ -z $previous ]]; then
  echo "no previous release to roll back to in $releases_dir" >&2
  exit 1
fi

ln -sfn "$previous" "$webroot.tmp"
mv -T "$webroot.tmp" "$webroot"
echo "rolled back to $previous"
REMOTE
  invalidate
  exit 0
fi

# Preflight: a truncated or missing build must not reach the origin at all.
if [[ ! -f dist/index.html || ! -f dist/404.html ]]; then
  echo "dist/ is missing index.html or 404.html — run 'pnpm build' first" >&2
  exit 1
fi

local_files=$(find dist -type f | wc -l)
echo "==> deploying $local_files files to $target ($SSH_HOST:$webroot)"

release="$RELEASES_ROOT/$target/$(date -u +%Y%m%dT%H%M%SZ)"

# Prune before transferring rather than after, so peak disk during a deploy is
# the release being served plus the one arriving, not three at once. Each
# release is the full 5.4GB tree.
ssh "$SSH_HOST" bash -s -- "$RELEASES_ROOT/$target" "$webroot" "$release" "$KEEP_RELEASES" <<'REMOTE'
set -euo pipefail
releases_dir=$1
webroot=$2
release=$3
keep=$4

mkdir -p "$releases_dir"

# First run: the webroot is still a real directory. Move it in as a release so
# it is what a rollback lands on, then it is replaced by the symlink below.
if [[ -d $webroot && ! -L $webroot ]]; then
  legacy="$releases_dir/$(date -u -r "$webroot" +%Y%m%dT%H%M%SZ)"
  echo "migrating existing $webroot to $legacy"
  mv "$webroot" "$legacy"
  ln -s "$legacy" "$webroot"
fi

# Retain (keep - 1) of the existing releases -- the one being served plus
# (keep - 2) older -- so that once the incoming release lands there are exactly
# $keep, not $keep + 1.
current=$(readlink -f "$webroot" 2>/dev/null || true)
find "$releases_dir" -mindepth 1 -maxdepth 1 -type d |
  sort -r |
  awk -v cur="$current" '$0 != cur' |
  tail -n +"$((keep - 1))" |
  while IFS= read -r old; do
    echo "pruning $old"
    rm -rf "$old"
  done

mkdir -p "$release"
REMOTE

echo "==> streaming to $release"
tar -cf - -C dist . |
  zstd -3 -T0 |
  ssh "$SSH_HOST" "zstd -d | tar -xf - -C '$release'"

echo "==> verifying $release"
remote_files=$(ssh "$SSH_HOST" "find '$release' -type f | wc -l")
if [[ $remote_files -ne $local_files ]]; then
  echo "transfer incomplete: $remote_files of $local_files files landed — leaving $target untouched" >&2
  echo "the partial release is at $SSH_HOST:$release" >&2
  exit 1
fi

echo "==> switching $webroot -> $release"
ssh "$SSH_HOST" bash -s -- "$webroot" "$release" <<'REMOTE'
set -euo pipefail
webroot=$1
release=$2

test -s "$release/index.html"
ln -sfn "$release" "$webroot.tmp"
mv -T "$webroot.tmp" "$webroot"
REMOTE

invalidate

if [[ $target == staging ]]; then
  echo "==> staging now serving $release (roll back with '$0 --staging --rollback')"
else
  echo "==> production now serving $release (roll back with '$0 --rollback')"
fi
