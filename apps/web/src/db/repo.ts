/**
 * Typed reads and writes over IndexedDB. The only importer of `dexie.ts` (`what.md` §7.1).
 *
 * A screen never touches Dexie: it calls a function here, or a store that calls one. That keeps
 * every query in one file, which is what makes "why is the queue empty" answerable from a log.
 */

import type { ReviewEvent } from '@kl/core';
import type { ContentPackage, PackageId } from '../content/types.ts';
import { now } from '../engine/clock.ts';
import { AppError } from '../errors.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';
import { db, type EventRow, type KvKey, type OutboxKind, type OutboxRow } from './dexie.ts';

function toEvent(row: EventRow): ReviewEvent {
  return {
    id: row.id,
    itemId: row.itemId,
    at: row.at,
    kind: row.kind,
    grade: row.grade,
    device: row.device,
  };
}

function toRow(event: ReviewEvent, synced: 0 | 1): EventRow {
  return { ...event, synced };
}

// ---------------------------------------------------------------------------- events

/**
 * Appends one locally recorded event. `put` and not `add`: the id is a UUIDv7 minted on this
 * device, so a collision means a retry of the same write, and re-writing it is the right answer.
 */
export async function appendEvent(event: ReviewEvent): Promise<void> {
  await db.events.put(toRow(event, 0));
  breadcrumb('engine', 'repo.appendEvent', { itemId: event.itemId, kind: event.kind });
}

/** Every event, ordered by `at` — the order the fold wants (it re-sorts anyway). */
export async function allEvents(): Promise<ReviewEvent[]> {
  const rows = await db.events.orderBy('at').toArray();
  return rows.map(toEvent);
}

export async function eventCount(): Promise<number> {
  return db.events.count();
}

/** The push queue (§7.4). Oldest first, so a partial push still makes forward progress. */
export async function unsyncedEvents(limit = 500): Promise<ReviewEvent[]> {
  const rows = await db.events.where('synced').equals(0).limit(limit).toArray();
  rows.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return rows.map(toEvent);
}

export async function unsyncedCount(): Promise<number> {
  return db.events.where('synced').equals(0).count();
}

/** Called after a `200` from `/api/sync/push`. Ids the table does not know are ignored. */
export async function markSynced(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.events
    .where('id')
    .anyOf(ids as string[])
    .modify({ synced: 1 });
  breadcrumb('sync', 'repo.markSynced', { count: ids.length });
}

/**
 * Inserts events pulled from the server. Already-known ids are left untouched — in particular a
 * local event still waiting to be pushed keeps `synced = 0` until its own push succeeds.
 */
export async function insertPulled(events: readonly ReviewEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  const known = new Set(
    (await db.events
      .where('id')
      .anyOf(events.map((e) => e.id))
      .primaryKeys()) as string[],
  );
  const fresh = events.filter((e) => !known.has(e.id)).map((e) => toRow(e, 1));
  if (fresh.length > 0) await db.events.bulkPut(fresh);
  breadcrumb('sync', 'repo.insertPulled', { received: events.length, inserted: fresh.length });
  return fresh.length;
}

/** The last N events by `at`, newest first — the tail an error snapshot carries (§10.1). */
export async function lastEvents(limit = 20): Promise<ReviewEvent[]> {
  const rows = await db.events.orderBy('at').reverse().limit(limit).toArray();
  return rows.map(toEvent);
}

// ---------------------------------------------------------------------------- outbox

export async function outboxEnqueue(kind: OutboxKind, payload: unknown): Promise<number> {
  const row: OutboxRow = { kind, payload, attempts: 0, createdAt: now(), lastError: null };
  const seq = await db.outbox.add(row);
  breadcrumb('log', 'repo.outboxEnqueue', { kind, seq });
  return seq;
}

/** Oldest first: the drain order of §7.4. */
export async function outboxAll(limit = 100): Promise<OutboxRow[]> {
  return db.outbox.orderBy('createdAt').limit(limit).toArray();
}

export async function outboxByKind(kind: OutboxKind): Promise<OutboxRow[]> {
  return db.outbox.where('kind').equals(kind).toArray();
}

export async function outboxCount(): Promise<number> {
  return db.outbox.count();
}

/** An outbox item is deleted only on a `2xx`, or dropped on a non-429 `4xx` (§7.4). */
export async function outboxDelete(seq: number): Promise<void> {
  await db.outbox.delete(seq);
  breadcrumb('log', 'repo.outboxDelete', { seq });
}

export async function outboxRecordFailure(seq: number, reason: string): Promise<void> {
  const row = await db.outbox.get(seq);
  if (row === undefined) return;
  await db.outbox.put({ ...row, seq, attempts: row.attempts + 1, lastError: reason });
}

// ---------------------------------------------------------------------------- packages

export async function getPackage(packageId: PackageId): Promise<ContentPackage | null> {
  const row = await db.packages.get(packageId);
  return row?.json ?? null;
}

export async function putPackage(pkg: ContentPackage, bytes: number): Promise<void> {
  await db.packages.put({
    packageId: pkg.packageId,
    version: pkg.version,
    hash: pkg.hash,
    bytes,
    json: pkg,
  });
  breadcrumb('download', 'repo.putPackage', { packageId: pkg.packageId, version: pkg.version });
}

/** `{ free: '2026-09-30.1', ... }` for the error snapshot. */
export async function packageVersions(): Promise<Record<string, string>> {
  const rows = await db.packages.toArray();
  const out: Record<string, string> = {};
  for (const row of rows) out[row.packageId] = row.version;
  return out;
}

// ---------------------------------------------------------------------------- kv

/**
 * The caller names the shape it expects. A key→type lookup would be the clever version and
 * §17.3 rules that out; a wrong `T` here is caught by the store that owns the key, which is the
 * only code that reads it.
 */
export async function kvGet<T>(key: KvKey): Promise<T | undefined> {
  const row = await db.kv.get(key);
  return row === undefined ? undefined : (row.value as T);
}

export async function kvSet(key: KvKey, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}

export async function kvDelete(key: KvKey): Promise<void> {
  await db.kv.delete(key);
}

// ---------------------------------------------------------------------------- lifecycle

/** Opens the database during bootstrap so a failure is one named error, not a later mystery. */
export async function openDatabase(): Promise<void> {
  try {
    await db.open();
  } catch (err) {
    throw new AppError('DB_OPEN_FAILED', 'IndexedDB could not be opened', { cause: String(err) });
  }
}
