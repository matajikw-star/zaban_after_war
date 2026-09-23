/**
 * The three intro slides (`what.md` §7.8 onboarding row): what the app is, the exam-frequency
 * claim, Leitner in one picture. `Onboarding.tsx` owns the footer (back/next); this file only
 * renders each slide's own content.
 */

import { strings } from '../../strings.ts';
import { Button } from '../../ui/Button.tsx';
import type { OnboardingStep } from './steps.ts';

/** Five boxes, growing — the picture behind «هر واژه در یکی از پنج جعبه جا می‌گیرد». Monochrome
 *  (ADR-0020): opacity carries the "further along" idea instead of colour. */
function LeitnerDiagram() {
  const boxes = [1, 2, 3, 4, 5];
  return (
    <svg
      viewBox="0 0 260 100"
      role="img"
      aria-label={strings.onboarding.slide3Title}
      className="h-24 w-full max-w-xs"
    >
      {boxes.map((box, i) => {
        const width = 32 + i * 8;
        const height = 32 + i * 10;
        const x = i * 50 + 10;
        const y = 100 - height - 8;
        return (
          <rect
            key={box}
            x={x}
            y={y}
            width={width}
            height={height}
            rx={8}
            fill="none"
            stroke="var(--fg)"
            strokeWidth={2}
            opacity={0.35 + i * 0.13}
          />
        );
      })}
    </svg>
  );
}

export interface SlidesProps {
  readonly step: Extract<OnboardingStep, 'slide-1' | 'slide-2' | 'slide-3'>;
  readonly onHaveAccount: () => void;
}

export function Slides({ step, onHaveAccount }: SlidesProps) {
  const content =
    step === 'slide-1'
      ? { title: strings.onboarding.slide1Title, body: strings.onboarding.slide1Body }
      : step === 'slide-2'
        ? { title: strings.onboarding.slide2Title, body: strings.onboarding.slide2Body }
        : { title: strings.onboarding.slide3Title, body: strings.onboarding.slide3Body };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      {step === 'slide-3' ? <LeitnerDiagram /> : null}
      <h1 className="text-h4 font-medium">{content.title}</h1>
      <p className="text-body text-[var(--fg-muted)]">{content.body}</p>
      {step === 'slide-1' ? (
        <Button variant="ghost" size="sm" onClick={onHaveAccount}>
          {strings.onboarding.haveAccount}
        </Button>
      ) : null}
    </div>
  );
}
