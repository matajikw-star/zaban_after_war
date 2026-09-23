/**
 * The update state machine (`what.md` §7.7): `idle → available → applying`, one pure, total
 * `transition(state, event)` with a breadcrumb on every change — the same discipline as
 * `sync/backup.ts`'s machine.
 *
 * Like `sync/backup.ts`'s runner, this one is fully wired: `register.ts`
 * is the only real caller of the runtime functions below (`noteNeedRefresh`, `onRegistered`,
 * `applyUpdate`, `setUpdateSwFn`), and everything else in this file is pure, which is what the
 * unit tests exercise directly with a fake registration and a fake `updateSW`.
 */

import { kvGet, kvSet } from '../db/repo.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';
import { usePwaStore } from '../stores/pwa.ts';

export type UpdateStateName = 'idle' | 'available' | 'applying';

export interface UpdateState {
  readonly name: UpdateStateName;
}

export type UpdateEvent =
  | { readonly type: 'NEED_REFRESH' }
  | { readonly type: 'APPLY' }
  | { readonly type: 'RESET' };

export const UPDATE_IDLE: UpdateState = { name: 'idle' };

/**
 * Pure and total: every state answers every event (§17.2). `idle` is the boot default;
 * `available` is the chip on Home; `applying` is terminal until the page reloads, so a stray
 * second `NEED_REFRESH` or a duplicate tap while applying is a no-op rather than a restart — the
 * update never lands mid-session unless the user tapped exactly once.
 */
export function transition(state: UpdateState, event: UpdateEvent): UpdateState {
  const next = compute(state, event);
  if (next !== state) {
    breadcrumb('sw', 'update.transition', { from: state.name, event: event.type, to: next.name });
  }
  return next;
}

function compute(state: UpdateState, event: UpdateEvent): UpdateState {
  switch (state.name) {
    case 'idle':
      switch (event.type) {
        case 'NEED_REFRESH':
          return { name: 'available' };
        case 'APPLY':
        case 'RESET':
          return state;
      }
      break;

    case 'available':
      switch (event.type) {
        case 'APPLY':
          return { name: 'applying' };
        case 'RESET':
          return { name: 'idle' };
        // Already showing the chip; a second background check that finds the same waiting
        // worker changes nothing.
        case 'NEED_REFRESH':
          return state;
      }
      break;

    case 'applying':
      switch (event.type) {
        case 'NEED_REFRESH':
        case 'APPLY':
        case 'RESET':
          return state;
      }
      break;
  }
  return state;
}

/** A structural subset of `ServiceWorkerRegistration`, so a test can fake one with no DOM. */
export interface RegistrationLike {
  readonly waiting: unknown;
}

/**
 * No waiting worker on a fresh registration means whatever set `kv.swUpdateAvailable` was
 * already applied — most likely at the start of the previous cold start (§7.7: "applies on tap
 * or on the next cold start"). The flag is stale and is cleared rather than shown again.
 */
export function hasWaitingWorker(registration: RegistrationLike | null | undefined): boolean {
  return registration != null && registration.waiting != null;
}

type UpdateSwFn = (reloadPage?: boolean) => Promise<void>;

let currentState: UpdateState = UPDATE_IDLE;
let updateSw: UpdateSwFn | null = null;

function setState(next: UpdateState): void {
  currentState = next;
  usePwaStore.getState().setUpdateReady(next.name === 'available');
}

/** The machine's current state. Read by tests; the UI reads `stores/pwa.ts` instead. */
export function updateState(): UpdateState {
  return currentState;
}

/** There is exactly one service worker per page, so the machine is a module singleton in the
 * app; tests reset it explicitly instead of re-importing the module. */
export function resetUpdateStateForTests(): void {
  currentState = UPDATE_IDLE;
  updateSw = null;
}

/** `register.ts` hands over the closure `virtual:pwa-register`'s `registerSW()` returns. */
export function setUpdateSwFn(fn: UpdateSwFn): void {
  updateSw = fn;
}

/** `registerSW`'s `onNeedRefresh` callback. */
export async function noteNeedRefresh(): Promise<void> {
  setState(transition(currentState, { type: 'NEED_REFRESH' }));
  await kvSet('swUpdateAvailable', true);
}

/**
 * `registerSW`'s `onRegisteredSW` callback. Clears a stale `kv.swUpdateAvailable` left over from
 * a session that already applied its update before this cold start (see `hasWaitingWorker`).
 */
export async function onRegistered(registration: RegistrationLike | undefined): Promise<void> {
  breadcrumb('sw', 'update.registered', { hasWaiting: hasWaitingWorker(registration) });
  if (hasWaitingWorker(registration)) return;
  const stale = await kvGet<boolean>('swUpdateAvailable');
  if (stale === true) {
    await kvSet('swUpdateAvailable', false);
    setState(transition(currentState, { type: 'RESET' }));
  }
}

/**
 * The chip's tap handler — the only place `updateSW(true)` is called, so a reload mid-session
 * only ever happens because the user asked for it here (§7.7: "Never mid-session").
 */
export async function applyUpdate(): Promise<void> {
  // Guarded on the *previous* state, not `transition`'s result: `applying + APPLY → applying`
  // is a no-op state-wise (see the table above), but without this check it would still call
  // `updateSW` a second time for a second tap before the reload has happened.
  if (currentState.name === 'applying') return;
  const next = transition(currentState, { type: 'APPLY' });
  if (next.name !== 'applying') return;
  setState(next);
  await kvSet('swUpdateAvailable', false);
  if (updateSw === null) return;
  await updateSw(true);
}
