/**
 * The IndexedDB schema, version 1, exactly as `what.md` §7.3.
 *
 * Only `repo.ts` imports this file. Everything else in the app goes through the repo, so there
 * is one place to look when a query is wrong and one place to change when the schema moves.
 *
 * Schema changes are new Dexie versions with upgrade functions. `events` is append-only and is
 * never deleted — it is the source of truth for user progress (ADR-0002).
 */

import type { ReviewEvent } from '@kl/core';
import Dexie, { type Table } from 'dexie';
import type { ContentPackage, PackageId } from '../content/types.ts';

/** A `ReviewEvent` plus the one mutable bit the device owns: has the server got it yet. */
export interface EventRow {
  readonly id: string;
  readonly itemId: string;
  readonly at: number;
  readonly kind: ReviewEvent['kind'];
  readonly grade: ReviewEvent['grade'];
  readonly device: string;
  /** 0 = not yet pushed. Indexed, because the push query is `where synced = 0`. */
  readonly synced: 0 | 1;
}

/** Non-progress uploads. Progress never goes here: it is the `events` table (§7.4). */
export type OutboxKind = 'flag' | 'beacon' | 'error';

export interface OutboxRow {
  /** Auto-incremented by Dexie; absent on the object handed to `add()`. */
  readonly seq?: number;
  readonly kind: OutboxKind;
  readonly payload: unknown;
  readonly attempts: number;
  readonly createdAt: number;
  readonly lastError: string | null;
}

/** One whole content package as one record — swapped atomically, never merged (§6). */
export interface PackageRow {
  readonly packageId: PackageId;
  readonly version: string;
  readonly hash: string;
  readonly bytes: number;
  readonly json: ContentPackage;
}

/**
 * The fixed set of `kv` keys (§7.3). A union rather than a free string, so a typo is a compile
 * error and `tools/logs` can enumerate what a device could be holding.
 */
export type KvKey =
  | 'installId'
  | 'auth'
  | 'profile'
  | 'entitlement'
  | 'syncCursor'
  | 'lastBackupAt'
  | 'onboarding'
  | 'pendingPayment'
  | 'presentationsBeforePaywall'
  | 'swUpdateAvailable'
  | 'theme'
  | 'downloadReceivedBytes'
  /** The `examDate` (epoch ms) the season screen was last shown for — shows it once (§7.8). */
  | 'seasonShownFor';

export interface KvRow {
  readonly key: KvKey;
  readonly value: unknown;
}

export class KlDatabase extends Dexie {
  // `declare` and not a definite-assignment `!`: with `useDefineForClassFields` (ES2022 target)
  // a declared field would be defined as `undefined` on the instance and shadow the table
  // objects Dexie installs in `version().stores()`.
  declare events: Table<EventRow, string>;
  declare outbox: Table<OutboxRow, number>;
  declare packages: Table<PackageRow, PackageId>;
  declare kv: Table<KvRow, KvKey>;

  constructor(name = 'konkur-leitner') {
    super(name);
    this.version(1).stores({
      events: 'id, synced, itemId, at',
      outbox: '++seq, kind, createdAt',
      packages: 'packageId',
      kv: 'key',
    });
  }
}

export const db = new KlDatabase();
