/**
 * The login merge (`what.md` §7.4, ADR-0002): the one place a fresh login hands over to backup.
 *
 * TODO(.scratch/dev-server/issues/03-sync-backup-and-restore.md): set every local event's
 * `synced = 0`, push, then pull — so a device that studied anonymously keeps its progress and a
 * reinstall gets it back. Until ticket 03 lands this is deliberately a no-op: the login itself is
 * complete without it, and the event log is untouched either way.
 *
 * Called exactly once per successful login, from `screens/login/flow.ts`, after the token is in
 * `kv`. A throw here is reported by the caller and never undoes the login.
 */

import { breadcrumb } from '../log/breadcrumbs.ts';

export async function runLoginMerge(userId: string): Promise<void> {
  breadcrumb('sync', 'loginMerge.skipped', { reason: 'ticket-03', hasUser: userId !== '' });
}
