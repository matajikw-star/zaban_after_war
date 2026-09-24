/**
 * `/progress` (`what.md` §7.8): the percent, the 30-day chart, and the pace estimate.
 */

import { ONBOARDING_MINUTES } from '@kl/core';
import { currentChartData } from '../../engine/chart-data.ts';
import { pace, progress } from '../../engine/index.ts';
import { useFold } from '../../engine/use-fold.ts';
import { useContentStore } from '../../stores/content.ts';
import { useSettingsStore } from '../../stores/settings.ts';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { Card } from '../../ui/Card.tsx';
import { faNumber, faPercent } from '../../ui/format.ts';
import { ProgressBar } from '../../ui/Progress.tsx';
import { BOTTOM_NAV_SPACER_CLASS, BottomNav } from '../layout/BottomNav.tsx';
import { ChartBars } from './ChartBars.tsx';

/** The next minute tier above the current one, or the current one if already at the top. */
function nextTier(minutesPerDay: number): number {
  const index = ONBOARDING_MINUTES.indexOf(minutesPerDay);
  if (index === -1 || index === ONBOARDING_MINUTES.length - 1) {
    return ONBOARDING_MINUTES[ONBOARDING_MINUTES.length - 1] ?? minutesPerDay;
  }
  return ONBOARDING_MINUTES[index + 1] ?? minutesPerDay;
}

export function Progress() {
  const profile = useSettingsStore((state) => state.profile);
  const setProfile = useSettingsStore((state) => state.setProfile);
  // Re-renders on every content load and every fold change, so the numbers below (read straight
  // from the live cache) are never stale.
  useContentStore((state) => state.items);
  useFold();

  const progressInfo = progress();
  const paceInfo = pace();
  const chart = currentChartData(30);

  const raiseGoal = (): void => {
    void setProfile({ minutesPerDay: nextTier(profile.minutesPerDay) });
  };

  return (
    <main className={`flex flex-1 flex-col gap-4 pt-2 ${BOTTOM_NAV_SPACER_CLASS}`}>
      <h1 className="flex min-h-11 items-center text-h5 font-medium">{strings.screens.progress}</h1>

      <Card className="flex flex-col gap-3">
        <p className="text-h3 font-medium">{faPercent(progressInfo.percent)}</p>
        <ProgressBar value={progressInfo.percent} ariaLabel={strings.a11y.progressBar} />
        <p className="text-caption text-[var(--fg-muted)]">{strings.progress.ruleSentence}</p>
        <p className="text-body-sm">
          {strings.progress.conqueredLine(
            faNumber(progressInfo.conquered),
            faNumber(progressInfo.total),
          )}
        </p>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-subtitle-sm font-medium">{strings.progress.chartTitle}</h2>
        <ChartBars days={chart} />
      </Card>

      <Card className="flex flex-col gap-3">
        {paceInfo === null ? (
          <p className="text-body-sm text-[var(--fg-muted)]">{strings.progress.noExamDate}</p>
        ) : (
          <>
            <p className="text-body-sm">
              {paceInfo.verdict === 'ahead'
                ? strings.progress.paceAhead(
                    faNumber(paceInfo.daysNeeded),
                    faNumber(paceInfo.daysLeft),
                  )
                : paceInfo.verdict === 'behind'
                  ? strings.progress.paceBehind(
                      faNumber(paceInfo.daysNeeded),
                      faNumber(paceInfo.daysLeft),
                    )
                  : strings.progress.paceOk(
                      faNumber(paceInfo.daysNeeded),
                      faNumber(paceInfo.daysLeft),
                    )}
            </p>
            {paceInfo.verdict === 'behind' ? (
              <Button variant="secondary" onClick={raiseGoal}>
                {strings.progress.raiseGoal}
              </Button>
            ) : null}
          </>
        )}
      </Card>

      <BottomNav />
    </main>
  );
}
