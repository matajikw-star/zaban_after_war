/**
 * Install-nudge step (`what.md` §7.8 onboarding row): a short message, no button of its own —
 * `Onboarding.tsx`'s footer supplies the continue action, labelled «ادامه» on this step.
 *
 * The real `beforeinstallprompt` capture and the install sheet are ticket 05 (`feat/web-pwa`,
 * built separately). This step is UI only, deliberately: wiring it here would mean guessing at an
 * API another branch owns.
 */

import { strings } from '../../strings.ts';

export function InstallStep() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-h5 font-medium">{strings.onboarding.installTitle}</h1>
      <p className="text-body text-[var(--fg-muted)]">{strings.onboarding.installBody}</p>
    </div>
  );
}
