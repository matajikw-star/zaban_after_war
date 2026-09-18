/**
 * Home (`what.md` §7.8).
 *
 * A placeholder with real wiring: the app name, the build, and the one primary action of the
 * screen. The goal ring, the streak, the progress percentage, the update chip and the backup dot
 * arrive with ticket 04 — the engine functions they need already exist behind `engine/`.
 */

import { useNavigate } from 'react-router';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { APP_VERSION, BUILD_SHA } from '../../version.ts';

export function Home() {
  const navigate = useNavigate();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-h4 font-medium">{strings.appName}</h1>
        <p className="text-caption text-[var(--fg-muted)]" dir="ltr">
          v{APP_VERSION} · {BUILD_SHA}
        </p>
      </div>

      <Button variant="primary" size="lg" onClick={() => void navigate('/review')}>
        {strings.home.startReview}
      </Button>
    </main>
  );
}
