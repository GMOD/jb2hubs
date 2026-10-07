#!/bin/bash
#
# website/server/provision.sh
#
# Bring an Ubuntu 24.04 instance to the state the genomes.jbrowse.org origin
# runs in. Safe to re-run: each step checks before it changes anything, and the
# script reports whether a reboot is still owed.
#
#   scp -r website/server myserver:/tmp/server
#   ssh myserver 'sudo bash /tmp/server/provision.sh'
#
# DEVELOPERS.md ("Origin server") says why each step is here.

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
swapfile=/swapfile
swap_size=1G

[[ $EUID -eq 0 ]] || {
  echo "run as root: sudo bash $0" >&2
  exit 1
}

# zstd is what website/deploy.sh streams a release through
apt-get install -y nginx zstd

install -m 644 "$here/nginx-site.conf" /etc/nginx/sites-available/default
ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
install -m 644 "$here/nginx-staging-map.conf" /etc/nginx/conf.d/staging-map.conf

# deploy.sh creates the html and staging symlinks; it needs to own the parent
mkdir -p /var/www/releases/production /var/www/releases/staging
chown ubuntu:ubuntu /var/www /var/www/releases /var/www/releases/production /var/www/releases/staging

nginx -t
systemctl enable --now nginx
systemctl reload nginx

if ! swapon --show=NAME --noheadings | grep -qx "$swapfile"; then
  fallocate -l "$swap_size" "$swapfile"
  chmod 600 "$swapfile"
  mkswap "$swapfile" >/dev/null
  swapon "$swapfile"
fi
grep -q "^$swapfile " /etc/fstab || echo "$swapfile none swap sw 0 0" >>/etc/fstab

if ! cmp -s "$here/grub-kho-off.cfg" /etc/default/grub.d/99-kho-off.cfg; then
  install -m 644 "$here/grub-kho-off.cfg" /etc/default/grub.d/99-kho-off.cfg
  update-grub
fi

echo
grep -E 'MemTotal|MemAvailable|CmaFree|SwapTotal' /proc/meminfo
if grep -qw 'kho=off' /proc/cmdline; then
  echo "kho=off is live"
else
  echo "kho=off is set for the next boot: reboot to apply it"
fi
