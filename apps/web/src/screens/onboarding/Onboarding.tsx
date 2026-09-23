/**
 * `/onboarding` (`what.md` §7.8 onboarding row, §5.5–5.6, ticket 02).
 *
 * Drives the step machine in `steps.ts` and renders each step's own component; this file owns
 * only the footer (back / skip / next) and the values collected along the way, mirroring the
 * split `Slides.tsx` documents. Reaching `done` is an effect, not a render: `finish` (from
 * `finish.ts`) writes the profile, queues the beacon, asks for persistent storage and navigates
 * home, guarded so a second entry into `done` cannot repeat any of it.
 */

import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { outboxEnqueue } from '../../db/repo.ts';
import type { BeaconEvent } from '../../net/api.ts';
import { useAuthStore } from '../../stores/auth.ts';
import { useSettingsStore } from '../../stores/settings.ts';
import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import { ExamDateStep } from './ExamDateStep.tsx';
import { FieldStep } from './FieldStep.tsx';
import { createFinishOnboarding, requestPersistentStorage } from './finish.ts';
import { InstallStep } from './InstallStep.tsx';
import { MinutesStep } from './MinutesStep.tsx';
import { PlacementStep } from './PlacementStep.tsx';
import { Slides } from './Slides.tsx';
import { isSkippable, type OnboardingEvent, type OnboardingStep, transition } from './steps.ts';

async function queueBeacon(installId: string, events: readonly BeaconEvent[]): Promise<void> {
  await outboxEnqueue('beacon', { installId, events });
}

export function Onboarding() {
  const navigate = useNavigate();
  const setProfile = useSettingsStore((state) => state.setProfile);
  const defaultProfile = useSettingsStore((state) => state.profile);

  const [step, setStep] = useState<OnboardingStep>('slide-1');
  const [minutesPerDay, setMinutesPerDay] = useState(defaultProfile.minutesPerDay);
  const [examDate, setExamDate] = useState<number | null>(defaultProfile.examDate);
  const [fieldCode, setFieldCode] = useState<string | null>(defaultProfile.fieldCode);

  // One finisher per mount, closed over the real deps — `createFinishOnboarding`'s own `fired`
  // flag is what makes reaching `done` twice harmless.
  const finish = useRef(
    createFinishOnboarding({
      setProfile,
      queueBeacon,
      installId: useAuthStore.getState().installId,
      persistStorage: requestPersistentStorage,
      navigate: (path) => navigate(path, { replace: true }),
    }),
  ).current;

  function advance(event: OnboardingEvent): void {
    const nextStep = transition(step, event);
    setStep(nextStep);
    if (nextStep === 'done') {
      void finish({ minutesPerDay, examDate, fieldCode });
    }
  }

  function renderStep(): ReactNode {
    switch (step) {
      case 'slide-1':
      case 'slide-2':
      case 'slide-3':
        return <Slides step={step} onHaveAccount={() => navigate('/login')} />;
      case 'minutes':
        return <MinutesStep minutesPerDay={minutesPerDay} onChange={setMinutesPerDay} />;
      case 'exam-date':
        return <ExamDateStep examDate={examDate} onChange={setExamDate} />;
      case 'field':
        return <FieldStep fieldCode={fieldCode} onChange={setFieldCode} />;
      case 'placement':
        // The pool being exhausted leaves the step exactly like «رد کردن» would.
        return <PlacementStep onLeave={() => advance('next')} />;
      case 'install':
        return <InstallStep />;
      case 'done':
        // Transient: `finish` above is already navigating away.
        return null;
    }
  }

  const showBack = step !== 'slide-1' && step !== 'done';
  const showSkip = isSkippable(step);
  const showFooter = step !== 'done';
  const nextLabel =
    step === 'install' ? strings.onboarding.installContinue : strings.onboarding.next;

  return (
    <div className="flex flex-1 flex-col">
      {renderStep()}
      {showFooter ? (
        <footer className="flex items-center justify-between gap-2 py-4">
          <div>
            {showBack ? (
              <Button variant="ghost" data-testid="onboarding-back" onClick={() => advance('back')}>
                {strings.onboarding.back}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {showSkip ? (
              <Button variant="ghost" data-testid="onboarding-skip" onClick={() => advance('skip')}>
                {strings.onboarding.skip}
              </Button>
            ) : null}
            <Button variant="primary" data-testid="onboarding-next" onClick={() => advance('next')}>
              {nextLabel}
            </Button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
