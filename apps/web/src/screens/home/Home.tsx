/**
 * Home (`what.md` §7.8).
 *
 * The goal ring, the streak, the progress line, the one primary action, the SW-update chip slot
 * and the backup dot. Also owns the once-only redirect to `/season` when the exam date has
 * passed — Home is the screen every cold start lands on, so it is the natural place to check.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { kvGet, kvSet } from '../../db/repo.ts';
import { now } from '../../engine/clock.ts';
import { presentationsToday, progress, streak } from '../../engine/index.ts';
import { seasonReached } from '../../engine/season.ts';
import { applyUpdate } from '../../pwa/update.ts';
import { useAuthStore } from '../../stores/auth.ts';
import { usePwaStore } from '../../stores/pwa.ts';
import { useSettingsStore } from '../../stores/settings.ts';
import { useSyncStore } from '../../stores/sync.ts';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { Card } from '../../ui/Card.tsx';
import { Chip } from '../../ui/Chip.tsx';
import { faNumber, faPercent } from '../../ui/format.ts';
import { ProgressBar, ProgressRing } from '../../ui/Progress.tsx';
import { BOTTOM_NAV_SPACER_CLASS, BottomNav } from '../layout/BottomNav.tsx';
import { useOnboardingRedirect } from '../onboarding/redirect.ts';

/** Redirects to `/season` once per exam date — the kv write makes it "once" across reloads. */
function useSeasonRedirect(examDate: number | null): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (!seasonReached(examDate, now())) return;
    let cancelled = false;
    void kvGet<number>('seasonShownFor').then((shownFor) => {
      if (cancelled || shownFor === examDate) return;
      void kvSet('seasonShownFor', examDate);
      navigate('/season');
    });
    return () => {
      cancelled = true;
    };
  }, [examDate, navigate]);
}

export function Home() {
  const navigate = useNavigate();
  const profile = useSettingsStore((state) => state.profile);
  const userId = useAuthStore((state) => state.userId);
  const backup = useSyncStore((state) => state.backup);
  const unsyncedCount = useSyncStore((state) => state.unsyncedCount);
  // `pwa/update.ts` drives this: `available` on a background download that finished (`NEED_REFRESH`),
  // cleared again once the tap starts `applying` (§7.7 — the chip disappears the instant it is
  // pressed, since the reload it triggers is about to replace this screen anyway).
  const updateReady = usePwaStore((state) => state.updateReady);

  useOnboardingRedirect();
  useSeasonRedirect(profile.examDate);

  const today = presentationsToday();
  const goal = profile.dailyGoal;
  const ringValue = goal > 0 ? Math.min(100, (today / goal) * 100) : 0;
  const streakInfo = streak();
  const progressInfo = progress();

  // No identity, nothing to restore: the dot only means something once there is a device the
  // owner could lose (§7.4).
  const showBackupDot = userId !== null;
  const backedUp = backup.name === 'idle' && unsyncedCount === 0;

  return (
    <main className={`flex flex-1 flex-col gap-4 pt-2 ${BOTTOM_NAV_SPACER_CLASS}`}>
      <header className="flex min-h-11 items-center justify-between gap-3">
        <h1 className="text-h5 font-medium">{strings.appName}</h1>
        {showBackupDot ? (
          <div className="flex items-center gap-2 text-caption text-[var(--fg-muted)]">
            <span
              aria-hidden="true"
              className={
                backedUp
                  ? 'inline-block h-2 w-2 rounded-full bg-[var(--fg-muted)]'
                  : 'inline-block h-2 w-2 rounded-full border border-[var(--fg-muted)]'
              }
            />
            <span>{backedUp ? strings.home.backupSynced : strings.home.backupPending}</span>
          </div>
        ) : null}
      </header>

      {updateReady ? (
        <button
          type="button"
          className="flex min-h-11 items-center justify-center self-center rounded-[var(--radius-pill)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fg)]"
          onClick={() => void applyUpdate()}
        >
          <Chip tone="solid">{strings.home.updateReady}</Chip>
        </button>
      ) : null}

      <Card className="flex flex-col items-center gap-3 py-7">
        <ProgressRing
          value={ringValue}
          size={168}
          strokeWidth={12}
          label={faNumber(today)}
          caption={strings.home.goalOf(faNumber(goal))}
          ariaLabel={strings.a11y.goalRing}
        />
        <span className="text-subtitle-sm font-medium text-[var(--fg-muted)]">
          {strings.home.todayGoalCaption}
        </span>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <Chip className="self-start">{strings.home.streakDays(faNumber(streakInfo.days))}</Chip>
        <ProgressBar value={progressInfo.percent} ariaLabel={strings.a11y.progressBar} />
        <p className="text-body-sm text-[var(--fg-muted)]">
          {strings.home.progressLine(
            faPercent(progressInfo.percent),
            faNumber(progressInfo.conquered),
            faNumber(progressInfo.total),
          )}
        </p>
      </Card>

      {/* The one primary action, low on the screen where the thumb already is. */}
      <div className="mt-auto pt-2">
        <Button variant="primary" size="lg" block onClick={() => void navigate('/review')}>
          {strings.home.startReview}
        </Button>
      </div>

      <BottomNav />
    </main>
  );
}
