/**
 * Service worker registration (`what.md` §7.1, §7.7).
 *
 * Called first in `bootstrap()` (`main.tsx`), ahead of opening the database: `captureInstallPrompt`
 * attaches the `beforeinstallprompt` listener with no `await` ahead of it (see `pwa/install.ts`),
 * and starting `registerSW` this early gives the browser the most time to find and download an
 * update in the background before the user is looking at the app.
 *
 * Production only. `vite.config.ts` sets `devOptions.enabled: false`, so there is no service
 * worker to register under `vite dev` — registering there would just 404 the virtual module's
 * generated `sw.js`.
 */

import { registerSW } from 'virtual:pwa-register';
import { breadcrumb } from '../log/breadcrumbs.ts';
import { captureInstallPrompt } from './install.ts';
import { noteNeedRefresh, onRegistered, setUpdateSwFn } from './update.ts';

export function registerServiceWorker(): void {
  // Independent of the SW itself: even a build with the SW disabled should still notice an
  // install opportunity.
  captureInstallPrompt();

  if (!import.meta.env.PROD) return;

  const updateSw = registerSW({
    onNeedRefresh: () => {
      breadcrumb('sw', 'register.needRefresh', {});
      void noteNeedRefresh();
    },
    onOfflineReady: () => {
      breadcrumb('sw', 'register.offlineReady', {});
    },
    onRegisteredSW: (swScriptUrl, registration) => {
      breadcrumb('sw', 'register.registered', { swScriptUrl });
      void onRegistered(registration);
    },
    onRegisterError: (error) => {
      breadcrumb('sw', 'register.error', { message: String(error) });
    },
  });

  setUpdateSwFn(updateSw);
}
