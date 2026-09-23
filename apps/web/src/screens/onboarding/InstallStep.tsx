/**
 * Install-nudge step (`what.md` §7.8 onboarding row): a short message plus, when there is
 * something to act on, the same per-context install affordance as `/settings`'s install sheet
 * (`screens/install/InstallSheet.tsx`) — `pwa/install.ts` already decided which context this
 * device is in before onboarding ever mounted (`captureInstallPrompt` runs first thing in
 * `main.tsx`'s `bootstrap()`).
 *
 * `Onboarding.tsx`'s footer supplies the continue action, labelled «ادامه» on this step, and it
 * never awaits anything here: tapping «نصب برنامه» (or the copy-link fallback) is a side action,
 * not a gate — continuing must never be blocked by the prompt.
 */

import { useState } from 'react';
import { promptInstall } from '../../pwa/install.ts';
import { useAuthStore } from '../../stores/auth.ts';
import { usePwaStore } from '../../stores/pwa.ts';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { CopyLinkButton } from '../install/InstallSheet.tsx';

export function InstallStep() {
  const context = usePwaStore((state) => state.installPrompt);
  const installId = useAuthStore((state) => state.installId);
  const [pending, setPending] = useState(false);

  async function install(): Promise<void> {
    setPending(true);
    await promptInstall(installId);
    setPending(false);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-h5 font-medium">{strings.onboarding.installTitle}</h1>
      <p className="text-body text-[var(--fg-muted)]">{strings.onboarding.installBody}</p>

      {context === 'native' ? (
        <Button variant="primary" disabled={pending} onClick={() => void install()}>
          {strings.onboarding.installNow}
        </Button>
      ) : null}

      {context === 'in-app-browser' ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-body-sm text-[var(--fg-muted)]">{strings.install.inAppBrowserBody}</p>
          <CopyLinkButton />
        </div>
      ) : null}

      {context === 'ios' ? (
        <p className="text-body-sm text-[var(--fg-muted)]">{strings.install.iosBody}</p>
      ) : null}
    </div>
  );
}
