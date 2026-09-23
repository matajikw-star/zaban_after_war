/**
 * Minutes-per-day step (`what.md` §5.5): one of `ONBOARDING_MINUTES`, default 20. Not skippable
 * — there is always a selection, so «بعدی» always has something to write.
 */

import { goalFromMinutes, ONBOARDING_MINUTES } from '@kl/core';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { faNumber } from '../../ui/format.ts';

export interface MinutesStepProps {
  readonly minutesPerDay: number;
  readonly onChange: (minutes: number) => void;
}

export function MinutesStep({ minutesPerDay, onChange }: MinutesStepProps) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <h1 className="text-h5 font-medium">{strings.onboarding.minutesTitle}</h1>
      <div className="flex flex-wrap gap-2">
        {ONBOARDING_MINUTES.map((minutes) => (
          <Button
            key={minutes}
            variant={minutesPerDay === minutes ? 'primary' : 'secondary'}
            onClick={() => onChange(minutes)}
          >
            {strings.settings.minutesOption(faNumber(minutes))}
          </Button>
        ))}
      </div>
      <p className="text-caption text-[var(--fg-muted)]">
        {strings.settings.dailyGoalCaption(faNumber(goalFromMinutes(minutesPerDay)))}
      </p>
    </div>
  );
}
