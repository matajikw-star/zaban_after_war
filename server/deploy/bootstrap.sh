#!/usr/bin/env bash
# One-time VPS bootstrap. Run as root over SSH on a fresh Ubuntu 24.04 machine:
#   ssh -i ~/.ssh/kl_root.pem root@<ip> 'bash -s' < server/deploy/bootstrap.sh
# Idempotent: safe to run again. See docs/spec/what.md §14.1 and docs/runbooks/server-setup.md.
set -euo pipefail

KL_USER=kl
KL_HOME=/opt/kl

echo "== packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ufw fail2ban unattended-upgrades curl rsync ca-certificates gnupg \
  debian-keyring debian-archive-keyring apt-transport-https

echo "== timezone"
timedatectl set-timezone Asia/Tehran

echo "== user ${KL_USER}"
if ! id -u "$KL_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$KL_USER"
fi
usermod -aG sudo "$KL_USER"
# So `kl` can read `journalctl -u kl-pocketbase` (debug-from-log.md) without sudo — idempotent,
# same as the line above (ticket dev-server/05 #3).
usermod -aG systemd-journal "$KL_USER"
echo "${KL_USER} ALL=(ALL) NOPASSWD: /bin/systemctl restart kl-pocketbase, /bin/systemctl restart caddy, /bin/systemctl reload caddy, /bin/systemctl status kl-pocketbase, /bin/systemctl status caddy" \
  > /etc/sudoers.d/kl-deploy
chmod 440 /etc/sudoers.d/kl-deploy
mkdir -p "/home/${KL_USER}/.ssh"
cp /root/.ssh/authorized_keys "/home/${KL_USER}/.ssh/authorized_keys"
chown -R "${KL_USER}:${KL_USER}" "/home/${KL_USER}/.ssh"
chmod 700 "/home/${KL_USER}/.ssh"; chmod 600 "/home/${KL_USER}/.ssh/authorized_keys"

echo "== directories"
mkdir -p ${KL_HOME}/{pb_public,pb_hooks,pb_migrations,pb_data,content,landing,landing/downloads,admin,sourcemaps,backups,placeholder}
chown -R "${KL_USER}:${KL_USER}" "$KL_HOME"

echo "== sshd hardening (keys only; root allowed with key only)"
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/10-kl.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
X11Forwarding no
EOF
sshd -t && systemctl reload ssh

echo "== firewall"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== fail2ban + unattended upgrades"
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== caddy (official apt repo)"
if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -yq caddy
fi
mkdir -p /var/log/caddy && chown -R caddy:caddy /var/log/caddy
# `caddy validate` (run below) writes an empty access.log as root before the service ever
# starts under the caddy user; without this the first reload fails with "permission denied".
touch /var/log/caddy/access.log && chown caddy:caddy /var/log/caddy/access.log

echo "== placeholder site (until the app is deployed)"
cp -f ${KL_HOME}/deploy/placeholder.html ${KL_HOME}/placeholder/index.html 2>/dev/null || true
cp -f ${KL_HOME}/deploy/Caddyfile.bootstrap /etc/caddy/Caddyfile 2>/dev/null || true
caddy validate --config /etc/caddy/Caddyfile && systemctl enable --now caddy && systemctl reload caddy

echo "== done"
echo "kl user ready; ssh -i <key> ${KL_USER}@$(curl -s -4 ifconfig.me || hostname -I | awk '{print $1}')"
