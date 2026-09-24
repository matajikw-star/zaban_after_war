/**
 * `refreshEntitlement` (`what.md` §7.6) bound to `/api/me`, the auth store and the download.
 * Fired at launch when logged in, after a login, and by the purchase result. Never throws.
 */

import { reportError } from '../log/errors.ts';
import { me } from '../net/api.ts';
import { useAuthStore } from '../stores/auth.ts';
import { requestDownload } from './download-live.ts';
import { type RefreshOutcome, refreshEntitlement } from './entitlement.ts';

export function refreshEntitlementNow(): Promise<RefreshOutcome> {
  if (useAuthStore.getState().userId === null) return Promise.resolve('failed');
  return refreshEntitlement({
    fetchMe: me,
    adopt: (server) => useAuthStore.getState().adoptServerEntitlement(server),
    onEntitled: () => {
      void requestDownload('entitled');
    },
    reportError: (err) => {
      void reportError('payment', err, { phase: 'entitlement.refresh' });
    },
  });
}
