/**
 * Install detection and the `beforeinstallprompt` capture (`what.md` §7.8's install paragraph).
 *
 * `captureInstallPrompt()` must run before any `await` in `bootstrap()`: Chrome can fire
 * `beforeinstallprompt` as soon as the page is deemed installable, and a listener attached even
 * one microtask late can miss it for the rest of the page's life — there is no way to ask for it
 * again short of a reload.
 */

import { now } from '../engine/clock.ts';
import { outboxEnqueue } from '../db/repo.ts';
import { breadcrumb } from '../log/breadcrumbs.ts';
import type { BeaconEvent } from '../net/api.ts';
import { usePwaStore } from '../stores/pwa.ts';
import { APP_VERSION } from '../version.ts';

/** Not in `lib.dom.d.ts` yet in most TS lib versions; this is the shape Chrome actually sends. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallContext = 'installed' | 'native' | 'in-app-browser' | 'ios' | 'unavailable';

export interface InstallContextInput {
  readonly userAgent: string;
  readonly standalone: boolean;
  readonly hasNativePrompt: boolean;
}

/** In-app browsers never fire `beforeinstallprompt`; they are told apart by UA sniffing because
 * there is no other signal (§7.8). Order matters: standalone and in-app-browser both override
 * whatever `hasNativePrompt` says. */
const IN_APP_BROWSER_PATTERNS: readonly RegExp[] = [
  /Telegram/i,
  /TelegramBot/i,
  /tgWebApp/i,
  /Instagram/i,
  /FBAN/i,
  /FBAV/i,
];

/** iOS Safari (not Chrome-on-iOS or Firefox-on-iOS, which are Safari's WebKit under a different
 * UA and do not offer Add to Home Screen the same way). */
const IOS_SAFARI_PATTERN = /iPhone|iPad|iPod/;
const IOS_OTHER_BROWSER_PATTERN = /CriOS|FxiOS|EdgiOS|OPiOS/;

/** Pure, so it is unit-tested with real-looking UA strings with no `navigator` in scope. */
export function detectInstallContext({
  userAgent,
  standalone,
  hasNativePrompt,
}: InstallContextInput): InstallContext {
  if (standalone) return 'installed';
  if (IN_APP_BROWSER_PATTERNS.some((pattern) => pattern.test(userAgent))) return 'in-app-browser';
  if (hasNativePrompt) return 'native';
  if (IOS_SAFARI_PATTERN.test(userAgent) && !IOS_OTHER_BROWSER_PATTERN.test(userAgent)) return 'ios';
  return 'unavailable';
}

let capturedEvent: BeforeInstallPromptEvent | null = null;

function isStandalone(): boolean {
  return globalThis.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

/** The live answer, for the initial store value and for re-checking after `appinstalled`. */
export function currentInstallContext(): InstallContext {
  return detectInstallContext({
    userAgent: globalThis.navigator?.userAgent ?? '',
    standalone: isStandalone(),
    hasNativePrompt: capturedEvent !== null,
  });
}

/**
 * Attaches the listeners synchronously (no `await` before this returns) and seeds
 * `stores/pwa.ts` with the UA-only answer — `ios`, `in-app-browser` and `unavailable` never
 * change again this session; `native` arrives when `beforeinstallprompt` actually fires.
 */
export function captureInstallPrompt(): void {
  usePwaStore.getState().setInstallPrompt(currentInstallContext());

  globalThis.window?.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    capturedEvent = event as BeforeInstallPromptEvent;
    breadcrumb('sw', 'install.beforeinstallprompt', {});
    usePwaStore.getState().setInstallPrompt('native');
  });

  globalThis.window?.addEventListener('appinstalled', () => {
    capturedEvent = null;
    breadcrumb('sw', 'install.appinstalled', {});
    usePwaStore.getState().setInstallPrompt('installed');
  });
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/**
 * Fires the captured native prompt, queues `install_prompt_shown` and — on acceptance —
 * `install_prompt_accepted` into the outbox exactly like `main.tsx`'s `first_open` (§8.4).
 */
export async function promptInstall(installId: string): Promise<InstallOutcome> {
  if (capturedEvent === null) return 'unavailable';

  const shown: BeaconEvent = { name: 'install_prompt_shown', at: now(), appVersion: APP_VERSION };
  await outboxEnqueue('beacon', { installId, events: [shown] });

  await capturedEvent.prompt();
  const { outcome } = await capturedEvent.userChoice;

  if (outcome === 'accepted') {
    const accepted: BeaconEvent = {
      name: 'install_prompt_accepted',
      at: now(),
      appVersion: APP_VERSION,
    };
    await outboxEnqueue('beacon', { installId, events: [accepted] });
  }

  capturedEvent = null;
  breadcrumb('sw', 'install.prompted', { outcome });
  return outcome;
}

/** Only for tests: `beforeinstallprompt` is a real browser event with no dispatch helper. */
export function setCapturedEventForTests(event: BeforeInstallPromptEvent | null): void {
  capturedEvent = event;
}
