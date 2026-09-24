#!/usr/bin/env bash
# One-time PocketBase install on the bootstrapped VPS (what.md §14.1, §14.4;
# docs/runbooks/deploy.md → "First deploy (one time)"). Run as root by `pnpm run provision`, which
# first uploads this script and everything it installs into a root-only staging directory:
#
#   <stage>/pocketbase             linux_amd64 binary, version server/POCKETBASE_VERSION, whose
#                                  release zip was checked against the release's checksums.txt
#                                  AND the pin in server/POCKETBASE_SHA256 on the machine that
#                                  downloaded it (github.com may be filtered from this VPS)
#   <stage>/pocketbase.sha256      `sha256sum -c` line for the binary, checked again here
#   <stage>/POCKETBASE_VERSION     the pinned version, checked against `pocketbase --version`
#   <stage>/kl-pocketbase.service  server/systemd/kl-pocketbase.service
#   <stage>/Caddyfile              server/Caddyfile (the real one; replaces Caddyfile.bootstrap)
#
# `provision` also writes the server env to /opt/kl/.env.new (mode 600, owner kl) just before
# running this; it is swapped in here so that a change to it can restart a running PocketBase.
#
# Idempotent: every install is "copy only if different", so a re-run changes nothing and restarts
# nothing unless something actually changed. It never *starts* a stopped PocketBase — the first
# `pnpm run deploy server` does that, once hooks and migrations are in place (its restart step
# refuses while /opt/kl/.env is missing) — and it only restarts a running one when its binary,
# unit or env changed and /opt/kl/.env exists.
#
# Never `set -x` here: /opt/kl/.env.new holds secrets and nothing below may echo it.

set -euo pipefail

STAGE="${1:-/root/kl-provision}"
KL_USER=kl
KL_HOME=/opt/kl
UNIT=kl-pocketbase
UNIT_FILE="/etc/systemd/system/${UNIT}.service"
CADDYFILE=/etc/caddy/Caddyfile

fail() {
  echo "PROVISION_FAILED: $*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail "run as root"
id -u "$KL_USER" >/dev/null 2>&1 || fail "user ${KL_USER} is missing — run server/deploy/bootstrap.sh first"
[ -d "$KL_HOME" ] || fail "${KL_HOME} is missing — run server/deploy/bootstrap.sh first"
command -v caddy >/dev/null 2>&1 || fail "caddy is not installed — run server/deploy/bootstrap.sh first"
for f in pocketbase pocketbase.sha256 POCKETBASE_VERSION kl-pocketbase.service Caddyfile; do
  [ -f "${STAGE}/${f}" ] || fail "${STAGE}/${f} was not uploaded"
done

changed=""

echo "== pocketbase binary"
(cd "$STAGE" && sha256sum --quiet -c pocketbase.sha256) || fail "pocketbase checksum mismatch in ${STAGE}"
chmod 755 "${STAGE}/pocketbase"
want_version="$(tr -d '[:space:]' < "${STAGE}/POCKETBASE_VERSION")"
got_version="$("${STAGE}/pocketbase" --version | awk '{print $NF}')"
[ "$got_version" = "$want_version" ] || fail "staged pocketbase is ${got_version}, POCKETBASE_VERSION says ${want_version}"
if cmp -s "${STAGE}/pocketbase" "${KL_HOME}/pocketbase"; then
  echo "unchanged (${got_version})"
else
  # Written beside the target and renamed over it: replacing a running executable this way is
  # safe on Linux (the old inode lives until the process exits); writing into it is not.
  install -m 755 -o "$KL_USER" -g "$KL_USER" "${STAGE}/pocketbase" "${KL_HOME}/pocketbase.new"
  mv -f "${KL_HOME}/pocketbase.new" "${KL_HOME}/pocketbase"
  changed="${changed} binary"
  echo "installed ${KL_HOME}/pocketbase (${got_version})"
fi

echo "== directories"
mkdir -p "${KL_HOME}"/{pb_data,pb_public,pb_hooks,pb_migrations,content,sourcemaps,backups}
chown "${KL_USER}:${KL_USER}" "${KL_HOME}"/{pb_data,pb_public,pb_hooks,pb_migrations,content,sourcemaps,backups}

echo "== systemd unit"
if cmp -s "${STAGE}/kl-pocketbase.service" "$UNIT_FILE"; then
  echo "unchanged"
else
  install -m 644 -o root -g root "${STAGE}/kl-pocketbase.service" "$UNIT_FILE"
  systemctl daemon-reload
  changed="${changed} unit"
  echo "installed ${UNIT_FILE}"
fi
systemctl enable "$UNIT" >/dev/null 2>&1 || fail "systemctl enable ${UNIT}"
echo "enabled (starts at boot)"

echo "== env"
if [ -f "${KL_HOME}/.env.new" ]; then
  if cmp -s "${KL_HOME}/.env.new" "${KL_HOME}/.env"; then
    rm -f "${KL_HOME}/.env.new"
    echo "unchanged"
  else
    chown "${KL_USER}:${KL_USER}" "${KL_HOME}/.env.new"
    chmod 600 "${KL_HOME}/.env.new"
    mv -f "${KL_HOME}/.env.new" "${KL_HOME}/.env"
    changed="${changed} env"
    echo "installed ${KL_HOME}/.env (mode 600, owner ${KL_USER})"
  fi
fi
if [ -f "${KL_HOME}/.env" ]; then
  [ "$(stat -c '%a %U' "${KL_HOME}/.env")" = "600 ${KL_USER}" ] || fail "${KL_HOME}/.env must be mode 600, owner ${KL_USER}"
else
  echo "WARNING: ${KL_HOME}/.env does not exist — PocketBase will not be started or restarted"
fi

echo "== pocketbase service"
if systemctl is-active --quiet "$UNIT"; then
  if [ -n "$changed" ] && [ -f "${KL_HOME}/.env" ]; then
    systemctl restart "$UNIT"
    echo "restarted (changed:${changed})"
  else
    echo "running, nothing to restart"
  fi
else
  echo "not running — the first \`pnpm run deploy server\` starts it"
fi

echo "== caddy"
if cmp -s "${STAGE}/Caddyfile" "$CADDYFILE"; then
  echo "unchanged"
else
  # Validate the new file where it stands; the live one is only touched once this passes.
  caddy validate --config "${STAGE}/Caddyfile" --adapter caddyfile >/dev/null 2>&1 \
    || { caddy validate --config "${STAGE}/Caddyfile" --adapter caddyfile || true; fail "the new Caddyfile does not validate; ${CADDYFILE} left as it was"; }
  cp -p "$CADDYFILE" "${CADDYFILE}.prev" 2>/dev/null || true
  install -m 644 -o root -g root "${STAGE}/Caddyfile" "${CADDYFILE}.new"
  mv -f "${CADDYFILE}.new" "$CADDYFILE"
  if systemctl reload caddy; then
    echo "installed ${CADDYFILE} and reloaded (previous kept as ${CADDYFILE}.prev)"
  else
    if [ -f "${CADDYFILE}.prev" ]; then
      mv -f "${CADDYFILE}.prev" "$CADDYFILE"
      systemctl reload caddy || true
    fi
    fail "caddy reload failed with the new Caddyfile; the previous one is restored"
  fi
fi

echo "== done"
