/**
 * The install sheet (`what.md` §7.8's install paragraph).
 *
 * Body varies by `stores/pwa.ts`'s `installPrompt`, which `pwa/install.ts` computes once at boot
 * from the UA (`ios` / `in-app-browser` / `unavailable`) and keeps live via the
 * `beforeinstallprompt` / `appinstalled` listeners (`native` / `installed`).
 *
 * Wired from `/settings` in this ticket; exported so onboarding's install nudge (a later ticket)
 * can reuse it without duplicating the per-context copy.
 */

import { useState } from 'react';
import { promptInstall } from '../../pwa/install.ts';
import { useAuthStore } from '../../stores/auth.ts';
import { usePwaStore } from '../../stores/pwa.ts';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { SheetContent, SheetRoot } from '../../ui/Sheet.tsx';

export interface InstallSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard === undefined) return;
    try {
      await clipboard.writeText(globalThis.location.href);
      setCopied(true);
    } catch {
      // Denied by the in-app browser's permissions — the sheet's own text is the fallback.
    }
  }

  return (
    <Button variant="secondary" block onClick={() => void copy()}>
      {copied ? strings.install.copied : strings.install.copyLink}
    </Button>
  );
}

export function InstallSheet({ open, onClose }: InstallSheetProps) {
  const context = usePwaStore((state) => state.installPrompt);
  const installId = useAuthStore((state) => state.installId);
  const [pending, setPending] = useState(false);

  async function install(): Promise<void> {
    setPending(true);
    await promptInstall(installId);
    setPending(false);
    onClose();
  }

  return (
    <SheetRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent title={strings.install.sheetTitle}>
        {context === 'native' ? (
          <Button variant="primary" block disabled={pending} onClick={() => void install()}>
            {strings.install.installAction}
          </Button>
        ) : null}

        {context === 'in-app-browser' ? (
          <div className="flex flex-col gap-3">
            <p className="text-body-sm text-[var(--fg-muted)]">{strings.install.inAppBrowserBody}</p>
            <CopyLinkButton />
          </div>
        ) : null}

        {context === 'ios' ? (
          <p className="text-body-sm text-[var(--fg-muted)]">{strings.install.iosBody}</p>
        ) : null}

        {context === 'installed' ? (
          <p className="text-body-sm text-[var(--fg-muted)]">{strings.install.installedBody}</p>
        ) : null}

        {context === 'unavailable' ? (
          <p className="text-body-sm text-[var(--fg-muted)]">{strings.install.unavailableBody}</p>
        ) : null}
      </SheetContent>
    </SheetRoot>
  );
}
