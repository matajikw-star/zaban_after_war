/**
 * Bootstrap (`what.md` §7.1).
 *
 * Ordered, and the order matters: open the database, settle who this device is, load the content
 * package the entitlement allows, fold the review log, then mount. Everything the first paint
 * reads is in memory by the time React runs, so no screen has a "loading" state for data that
 * was always local.
 *
 * A failure here is fatal and is reported before it is shown — a device that cannot open
 * IndexedDB cannot study, and the record is the only way we will ever hear about it.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { v7 as uuidv7 } from 'uuid';
import { allEvents, kvGet, kvSet, openDatabase, outboxEnqueue } from './db/repo.ts';
import { now } from './engine/clock.ts';
import { loadEvents } from './engine/fold-cache.ts';
import { AppError } from './errors.ts';
import { breadcrumb } from './log/breadcrumbs.ts';
import { installErrorCapture, reportError } from './log/errors.ts';
import type { BeaconEvent } from './net/api.ts';
import { registerServiceWorker } from './pwa/register.ts';
import { router } from './routes.tsx';
import { useAuthStore } from './stores/auth.ts';
import { useContentStore } from './stores/content.ts';
import { useSettingsStore } from './stores/settings.ts';
import { strings } from './strings.ts';
import { startBackup } from './sync/backup-live.ts';
import { APP_VERSION } from './version.ts';
import './index.css';

/**
 * The device identity of §7.2. Minted once, never rotated: it tags every review event as
 * `device`, so a new one would make this install look like a different phone in the log.
 */
async function ensureInstallId(): Promise<{ installId: string; firstOpen: boolean }> {
  const existing = await kvGet<string>('installId');
  if (existing !== undefined) return { installId: existing, firstOpen: false };
  const installId = uuidv7();
  await kvSet('installId', installId);
  breadcrumb('log', 'bootstrap.installId', { minted: true });
  return { installId, firstOpen: true };
}

/**
 * `first_open` (§8.4) goes into the outbox, not onto the network: the first launch is exactly
 * when a user is most likely to be offline, and the beacon is worth nothing if it is lost then.
 */
async function recordFirstOpen(installId: string): Promise<void> {
  const event: BeaconEvent = { name: 'first_open', at: now(), appVersion: APP_VERSION };
  await outboxEnqueue('beacon', { installId, events: [event] });
}

async function bootstrap(): Promise<void> {
  installErrorCapture();

  // Synchronous, no `await` before it: `registerServiceWorker` attaches the `beforeinstallprompt`
  // listener as its first act, and Chrome can fire that event as soon as the page is deemed
  // installable — a listener attached even one microtask late can miss it for the page's whole
  // life (`pwa/install.ts`). Guarded because a registration failure (a misconfigured build, a
  // browser that throws on `navigator.serviceWorker.register`) must never take the rest of the
  // app down with it — offline study is the product's whole promise (§7.7).
  try {
    registerServiceWorker();
  } catch (err) {
    void reportError('sw', err, { phase: 'bootstrap.registerServiceWorker' });
  }

  breadcrumb('log', 'bootstrap.start', { appVersion: APP_VERSION });

  await openDatabase();

  const { installId, firstOpen } = await ensureInstallId();
  await useAuthStore.getState().load(installId);
  await useSettingsStore.getState().load();

  const entitled = useAuthStore.getState().entitlement.status === 'full';
  // Reported, not fatal. A build that shipped without `content/free.json` is broken and the
  // record says so, but blanking the whole app would also take away settings, progress and the
  // review log the user already has. The screens that need content show their own empty state.
  try {
    await useContentStore.getState().load(entitled);
  } catch (err) {
    await reportError('error', err, { phase: 'bootstrap.content' });
  }

  loadEvents(await allEvents());

  if (firstOpen) await recordFirstOpen(installId);

  // After the fold, so a pull's re-fold adds to a loaded log. Not awaited: backup is never on
  // the path to the first paint, and it does nothing at all for an anonymous install (§7.4).
  startBackup().catch((err: unknown) => reportError('sync', err, { phase: 'bootstrap.backup' }));

  breadcrumb('log', 'bootstrap.done', { firstOpen, entitled });
}

function mount(): void {
  const container = document.getElementById('root');
  if (container === null) throw new AppError('KL_BOOT_NO_ROOT', 'the #root element is missing');

  createRoot(container).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

/**
 * The bootstrap failed, so there is no router and no error boundary to fall back on. Plain DOM,
 * Persian, and no promise that the page will recover on its own.
 */
function mountFatal(): void {
  const container = document.getElementById('root');
  if (container === null) return;
  container.replaceChildren();

  const main = document.createElement('main');
  main.style.cssText =
    'display:flex;min-height:100dvh;align-items:center;justify-content:center;padding:1.5rem;text-align:center';
  const title = document.createElement('h1');
  title.textContent = strings.crash.title;
  const body = document.createElement('p');
  body.textContent = strings.crash.body;
  const wrapper = document.createElement('div');
  wrapper.append(title, body);
  main.append(wrapper);
  container.append(main);
}

bootstrap().then(mount, (err: unknown) => {
  void reportError('error', err, { phase: 'bootstrap' });
  mountFatal();
});
