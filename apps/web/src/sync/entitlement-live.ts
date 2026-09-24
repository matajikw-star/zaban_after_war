/**
 * `refreshEntitlement` (`what.md` §7.6) bound to `/api/me`, the auth store and the download.
 * Fired at launch when logged in, after a login, and by the purchase result. Never throws.
 *
 * `followEntitlementNow` keeps the loaded package in step with the entitlement that counts now:
 * a sign-in, a sign-out or a server answer switches free ↔ paid without a reload.
 */

import { reportError } from '../log/errors.ts';
import { me } from '../net/api.ts';
import { useAuthStore } from '../stores/auth.ts';
import { useContentStore } from '../stores/content.ts';
import { requestDownload } from './download-live.ts';
import { followEntitlement, type RefreshOutcome, refreshEntitlement } from './entitlement.ts';

export function refreshEntitlementNow(): Promise<RefreshOutcome> {
  // The account the answer is about, fixed before the request: if the user signs out or switches
  // account while `/api/me` is in flight, the answer still lands in the right record.
  const userId = useAuthStore.getState().userId;
  if (userId === null) return Promise.resolve('failed');
  return refreshEntitlement({
    fetchMe: me,
    adopt: (server) => useAuthStore.getState().adoptServerEntitlement(server, userId),
    onEntitled: () => {
      // Only while that account is still the one signed in (§7.6).
      if (useAuthStore.getState().userId === userId) void requestDownload('entitled');
    },
    reportError: (err) => {
      void reportError('payment', err, { phase: 'entitlement.refresh' });
    },
  });
}

/**
 * Loads run one after another, and each reads the entitlement when its turn comes, so a quick
 * sign-out → sign-in can never finish with the older answer's package loaded.
 */
let contentLoads: Promise<void> = Promise.resolve();

function loadContentInTurn(): Promise<void> {
  const turn = contentLoads.then(() =>
    useContentStore.getState().load(useAuthStore.getState().entitlement.status === 'full'),
  );
  contentLoads = turn.catch(() => undefined);
  return turn;
}

/** Called once from `main.tsx`, after the content store has loaded. Returns the unsubscribe. */
export function followEntitlementNow(): () => void {
  return useAuthStore.subscribe((state, previous) => {
    void followEntitlement(previous.entitlement.status, state.entitlement.status, {
      loadContent: loadContentInTurn,
      requestDownload: () => {
        void requestDownload('entitled');
      },
      reportError: (err) => {
        void reportError('error', err, { phase: 'entitlement.follow' });
      },
    });
  });
}
