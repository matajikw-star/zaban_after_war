/**
 * Queue one §8.4 beacon. Into the outbox, never straight onto the network: the backup runner
 * sends it when it can (§7.4). Never throws — a lost beacon is worth less than a broken screen.
 */

import { outboxEnqueue } from '../db/repo.ts';
import { now } from '../engine/clock.ts';
import type { BeaconEvent, BeaconName } from '../net/api.ts';
import { useAuthStore } from '../stores/auth.ts';
import { APP_VERSION } from '../version.ts';
import { breadcrumb } from './breadcrumbs.ts';

export async function queueBeacon(name: BeaconName): Promise<void> {
  try {
    const event: BeaconEvent = { name, at: now(), appVersion: APP_VERSION };
    await outboxEnqueue('beacon', {
      installId: useAuthStore.getState().installId,
      events: [event],
    });
  } catch (err) {
    breadcrumb('log', 'beacon.queueFailed', { name, error: String(err) });
  }
}
