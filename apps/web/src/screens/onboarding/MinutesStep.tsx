/**
 * Minutes-per-day step (`what.md` §5.5): one of `ONBOARDING_MINUTES`, default 20. Not skippable
 * — there is always a selection, so «بعدی» always has something to write.
 */

import { goalFromMinutes, ONBOARDING_MINUTES } from '@kl/core';
import { strings } from '../../strings.ts';

import { faNumber } from '../../ui/format.ts';
import { Segmented } from '../../ui/Segmented.tsx';

export interface MinutesStepProps {
  readonly minutesPerDay: number;
  readonly onChange: (minutes: number) => void;
}

export function MinutesStep({ minutesPerDay, onChange }: MinutesStepProps) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-5">
      <h1 className="text-center text-h5 font-medium">{strings.onboarding.minutesTitle}</h1>
      <Segmented
        ariaLabel={strings.onboarding.minutesTitle}
        options={ONBOARDING_MINUTES.map((minutes) => ({
          value: minutes,
          label: strings.settings.minutesOption(faNumber(minutes)),
        }))}
        value={minutesPerDay}
        onChange={onChange}
      />
      <p className="text-center text-caption text-[var(--fg-muted)]">
        {strings.settings.dailyGoalCaption(faNumber(goalFromMinutes(minutesPerDay)))}
      </p>
    </div>
  );
}
