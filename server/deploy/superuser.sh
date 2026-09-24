#!/usr/bin/env bash
# Creates or updates the PocketBase superuser (what.md §11.1, §15). Run as root by
# `pnpm run provision`, after install.sh; the upsert itself runs as kl, so pb_data stays kl's.
#
# The credentials arrive on stdin — line 1 the email, line 2 the password — never as arguments
# to this script, so they are in no shell history and not in the ssh command line. Residual
# exposure, stated rather than hidden: PocketBase's CLI takes them only as arguments, so for the
# second or so the upsert runs they are in its argv, readable by root and kl through `ps` /
# /proc on the VPS itself. Nobody else logs in there.
#
# Idempotent: `superuser upsert` creates the account, or resets its password if it exists.
# It does not apply this repo's migrations (checked on 0.40.2) — `serve` does, on the first
# `pnpm run deploy server`.
#
# Never `set -x` here.

set -euo pipefail

fail() {
  echo "PROVISION_FAILED: $*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail "run as root"
[ -x /opt/kl/pocketbase ] || fail "/opt/kl/pocketbase is missing — run install.sh first"

IFS= read -r email || true
IFS= read -r password || true
[ -n "${email:-}" ] && [ -n "${password:-}" ] || fail "expected the email and the password on stdin, one per line"

runuser -u kl -- /opt/kl/pocketbase superuser upsert "$email" "$password" --dir /opt/kl/pb_data
