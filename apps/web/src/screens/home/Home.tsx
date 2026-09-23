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
import { Chip } from '../../ui/Chip.tsx';
import { faNumber, faPercent } from '../../ui/format.ts';
import { ProgressRing } from '../../ui/Progress.tsx';
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
    <main
      className={`flex flex-1 flex-col items-center gap-6 pt-4 text-center ${BOTTOM_NAV_SPACER_CLASS}`}
    >
      <h1 className="text-h4 font-medium">{strings.appName}</h1>

      {updateReady ? (
        <button
          type="button"
          className="appearance-none bg-transparent p-0"
          onClick={() => void applyUpdate()}
        >
          <Chip tone="solid">{strings.home.updateReady}</Chip>
        </button>
      ) : null}

      <div className="flex flex-col items-center gap-2">
        <ProgressRing
          value={ringValue}
          label={faNumber(today)}
          caption={strings.home.goalOf(faNumber(goal))}
          ariaLabel={strings.a11y.goalRing}
        />
        <span className="text-body-sm text-[var(--fg-muted)]">{strings.home.todayGoalCaption}</span>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Chip>{strings.home.streakDays(faNumber(streakInfo.days))}</Chip>
        <p className="text-body-sm text-[var(--fg-muted)]">
          {strings.home.progressLine(
            faPercent(progressInfo.percent),
            faNumber(progressInfo.conquered),
            faNumber(progressInfo.total),
          )}
        </p>
      </div>

      <Button variant="primary" size="lg" onClick={() => void navigate('/review')}>
        {strings.home.startReview}
      </Button>

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

      <BottomNav />
    </main>
  );
}
